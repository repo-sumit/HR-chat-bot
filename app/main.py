"""FastAPI application: routes, CORS, SSE streaming, rate limiting."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from pathlib import Path
from typing import AsyncGenerator

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response, StreamingResponse
from pydantic import BaseModel

from app import rag
from app.config import ALLOWED_ORIGINS, BOT_GREETING, BOT_NAME

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger(__name__)

app = FastAPI(title="PDF Support Bot")

# ── CORS ─────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── In-memory rate limiter ───────────────────────────────────────────
_rate_store: dict[str, list[float]] = {}
RATE_LIMIT = 30       # requests
RATE_WINDOW = 60.0    # seconds


def _is_rate_limited(ip: str) -> bool:
    now = time.time()
    timestamps = _rate_store.get(ip, [])
    # prune old entries
    timestamps = [t for t in timestamps if now - t < RATE_WINDOW]
    _rate_store[ip] = timestamps
    if len(timestamps) >= RATE_LIMIT:
        return True
    timestamps.append(now)
    return False


def _cleanup_rate_store():
    """Remove stale IPs to prevent unbounded memory growth."""
    now = time.time()
    stale = [ip for ip, ts in _rate_store.items() if not ts or now - ts[-1] > RATE_WINDOW * 2]
    for ip in stale:
        del _rate_store[ip]


# ── Startup ──────────────────────────────────────────────────────────

SELF_PING_URL = os.getenv("RENDER_EXTERNAL_URL")  # auto-set by Render
SELF_PING_INTERVAL = 600  # every 10 minutes


async def _keep_alive():
    """Ping ourselves periodically to prevent Render free-tier sleep."""
    if not SELF_PING_URL:
        return
    log.info("Keep-alive started: pinging %s every %ds", SELF_PING_URL, SELF_PING_INTERVAL)
    async with httpx.AsyncClient() as client:
        while True:
            await asyncio.sleep(SELF_PING_INTERVAL)
            try:
                resp = await client.get(f"{SELF_PING_URL}/", timeout=10)
                log.debug("Keep-alive ping: %s", resp.status_code)
            except Exception as exc:
                log.warning("Keep-alive ping failed: %s", exc)


@app.on_event("startup")
async def startup():
    try:
        n = rag.load_embeddings()
        log.info("Bot ready with %d chunks from document", n)
    except FileNotFoundError:
        log.warning("No embeddings file found — run `python scripts/ingest.py <pdf>` first")
    ok = await rag.verify_api_key()
    if not ok:
        log.error("GEMINI_API_KEY is invalid or Gemini API unreachable")
    # Start keep-alive background task
    asyncio.create_task(_keep_alive())


# ── Routes ───────────────────────────────────────────────────────────

@app.get("/")
async def health():
    return {"status": "ok", "bot_name": BOT_NAME}


class ChatRequest(BaseModel):
    message: str
    history: list[dict] = []


@app.post("/api/chat")
async def chat(req: ChatRequest, request: Request):
    ip = request.client.host if request.client else "unknown"
    if _is_rate_limited(ip):
        return JSONResponse(
            status_code=429,
            content={"error": "Rate limit exceeded. Please wait a moment."},
        )

    # periodic cleanup
    if len(_rate_store) > 500:
        _cleanup_rate_store()

    query = req.message.strip()
    if not query:
        return JSONResponse(status_code=400, content={"error": "Empty message"})

    # Retrieve relevant chunks
    try:
        query_emb = await rag.embed_query(query)
        chunks = rag.retrieve(query_emb)
    except Exception as exc:
        log.exception("Retrieval failed")
        return JSONResponse(status_code=500, content={"error": f"Retrieval error: {exc}"})

    sources = [{"page": c["page"], "score": round(c["score"], 3)} for c in chunks]

    async def event_stream() -> AsyncGenerator[str, None]:
        try:
            async for token in rag.generate_response(query, chunks, req.history):
                payload = json.dumps({"token": token, "done": False})
                yield f"data: {payload}\n\n"
            # final event
            payload = json.dumps({"token": "", "done": True, "sources": sources})
            yield f"data: {payload}\n\n"
        except Exception as exc:
            log.exception("Generation failed")
            err = json.dumps({"token": f"\n\n[Error: {exc}]", "done": True, "sources": []})
            yield f"data: {err}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


WIDGET_JS_PATH = Path(__file__).parent / "static" / "widget.js"


@app.get("/widget.js")
async def serve_widget(request: Request):
    """Serve widget.js with the API base URL injected."""
    js = WIDGET_JS_PATH.read_text(encoding="utf-8")
    # Determine the base URL from the incoming request
    scheme = request.headers.get("x-forwarded-proto", request.url.scheme)
    host = request.headers.get("host", request.url.netloc)
    base_url = f"{scheme}://{host}"
    js = js.replace("__API_BASE_URL__", base_url)
    js = js.replace("__BOT_NAME__", BOT_NAME)
    js = js.replace("__BOT_GREETING__", BOT_GREETING)
    return Response(content=js, media_type="application/javascript")

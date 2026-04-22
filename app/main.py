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

from datetime import datetime, timezone

from app import rag
from app.config import ADMIN_SECRET, ALLOWED_ORIGINS, BOT_GREETING, BOT_NAME, SUPABASE_KEY, SUPABASE_URL

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

# ── Supabase chat logging ───────────────────────────────────────────
_supabase_headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}
_supabase_client: httpx.AsyncClient | None = None


async def _get_supabase_client() -> httpx.AsyncClient:
    global _supabase_client
    if _supabase_client is None:
        _supabase_client = httpx.AsyncClient(
            base_url=f"{SUPABASE_URL}/rest/v1",
            headers=_supabase_headers,
        )
    return _supabase_client


async def log_chat(ip: str, question: str, sources: list[dict]):
    if not SUPABASE_URL:
        log.warning("Supabase logging skipped: SUPABASE_URL not set")
        return
    try:
        client = await _get_supabase_client()
        resp = await client.post("/chat_logs", json={
            "ip": ip,
            "question": question,
            "sources": json.dumps(sources),
        })
        if resp.status_code >= 400:
            log.warning("Supabase log rejected (%s): %s", resp.status_code, resp.text)
    except Exception as exc:
        log.warning("Supabase log failed: %s", exc)


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


# ── Friendly error messages ──────────────────────────────────────────

import re

def _friendly_error(exc: Exception) -> str:
    msg = str(exc)
    # Rate limit / quota exceeded
    if "429" in msg or "RESOURCE_EXHAUSTED" in msg:
        # Try to extract retry delay
        match = re.search(r'retry in (\d+)', msg, re.IGNORECASE)
        if match:
            secs = int(match.group(1))
            mins = secs // 60
            remaining = secs % 60
            if mins > 0:
                return f"Bot is busy due to high usage. Please try again in {mins}m {remaining}s."
            return f"Bot is busy due to high usage. Please try again in {secs} seconds."
        return "Bot is busy due to high usage. Please try again in 1-2 minutes."
    # Invalid API key
    if "API_KEY_INVALID" in msg or "API key" in msg:
        return "Service is temporarily unavailable. Please try again later."
    # Model overloaded
    if "503" in msg or "UNAVAILABLE" in msg:
        return "Service is under heavy load. Please try again in a few minutes."
    # Generic
    return "Something went wrong. Please try again in a moment."


# ── Startup ──────────────────────────────────────────────────────────

SELF_PING_URL = os.getenv("RENDER_EXTERNAL_URL") or "https://hr-chat-bot-jr1z.onrender.com"
SELF_PING_INTERVAL = 300  # every 5 minutes (Render sleeps after 15min)


async def _keep_alive():
    """Ping ourselves every 5 minutes to prevent Render free-tier sleep."""
    await asyncio.sleep(10)  # wait for server to fully start
    log.info("Keep-alive started: pinging %s every %ds", SELF_PING_URL, SELF_PING_INTERVAL)
    async with httpx.AsyncClient() as client:
        while True:
            try:
                resp = await client.get(f"{SELF_PING_URL}/", timeout=30)
                log.info("Keep-alive ping: %s", resp.status_code)
            except Exception as exc:
                log.warning("Keep-alive ping failed: %s", exc)
            await asyncio.sleep(SELF_PING_INTERVAL)


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
    if SUPABASE_URL:
        log.info("Supabase logging enabled: %s", SUPABASE_URL)
    # Start keep-alive background task
    asyncio.create_task(_keep_alive())


@app.on_event("shutdown")
async def shutdown():
    if _supabase_client:
        await _supabase_client.aclose()


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
        return JSONResponse(status_code=500, content={"error": _friendly_error(exc)})

    sources = [{"page": c["page"], "score": round(c["score"], 3)} for c in chunks]
    await log_chat(ip, query, sources)

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
            msg = _friendly_error(exc)
            err = json.dumps({"token": "", "done": True, "sources": [], "error": msg})
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


# ── Analytics dashboard ─────────────────────────────────────────────

@app.get("/api/analytics")
async def analytics(secret: str = ""):
    if secret != ADMIN_SECRET:
        return JSONResponse(status_code=401, content={"error": "Invalid secret"})
    client = await _get_supabase_client()
    # Total count
    r = await client.get("/chat_logs?select=id", headers={**_supabase_headers, "Prefer": "count=exact", "Range": "0-0"})
    total = int(r.headers.get("content-range", "*/0").split("/")[-1])
    # Today count
    today = datetime.now(timezone.utc).strftime("%Y-%m-%dT00:00:00")
    r2 = await client.get(f"/chat_logs?select=id&created_at=gte.{today}", headers={**_supabase_headers, "Prefer": "count=exact", "Range": "0-0"})
    today_count = int(r2.headers.get("content-range", "*/0").split("/")[-1])
    # Unique IPs
    r3 = await client.get("/chat_logs?select=ip")
    ips = set(row["ip"] for row in r3.json()) if r3.status_code == 200 else set()
    return {
        "total_questions": total,
        "unique_users": len(ips),
        "today_questions": today_count,
    }


@app.get("/api/analytics/logs")
async def analytics_logs(secret: str = "", limit: int = 50, offset: int = 0):
    if secret != ADMIN_SECRET:
        return JSONResponse(status_code=401, content={"error": "Invalid secret"})
    client = await _get_supabase_client()
    r = await client.get(
        f"/chat_logs?select=*&order=created_at.desc&limit={limit}&offset={offset}",
    )
    logs = r.json() if r.status_code == 200 else []
    # Remap fields for dashboard compatibility
    for entry in logs:
        entry["timestamp"] = entry.pop("created_at", "")
        if isinstance(entry.get("sources"), str):
            entry["sources"] = json.loads(entry["sources"])
    r2 = await client.get("/chat_logs?select=id", headers={**_supabase_headers, "Prefer": "count=exact", "Range": "0-0"})
    total = int(r2.headers.get("content-range", "*/0").split("/")[-1])
    return {"total": total, "logs": logs}


@app.get("/dashboard")
async def dashboard(secret: str = ""):
    if secret != ADMIN_SECRET:
        return Response(content="<h3>Unauthorized. Add ?secret=YOUR_SECRET to the URL.</h3>", media_type="text/html")
    html = """<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Chat Analytics</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',system-ui,sans-serif;background:#f7f8fc;color:#333;padding:24px}
h1{color:#2D2B7F;margin-bottom:24px;font-size:24px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-bottom:32px}
.stat{background:#fff;border-radius:12px;padding:20px;box-shadow:0 2px 10px rgba(45,43,127,.08);border:1px solid #ececf4}
.stat .num{font-size:32px;font-weight:700;color:#2D2B7F}
.stat .label{font-size:13px;color:#888;margin-top:4px}
table{width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 10px rgba(45,43,127,.08)}
th{background:#2D2B7F;color:#fff;padding:12px 16px;text-align:left;font-size:13px;font-weight:600}
td{padding:10px 16px;border-bottom:1px solid #ececf4;font-size:13px}
tr:hover td{background:#f7f8fc}
.q{max-width:400px;word-wrap:break-word}
.time{color:#888;white-space:nowrap}
.refresh{background:#5BC5C8;color:#fff;border:none;padding:8px 20px;border-radius:8px;cursor:pointer;font-weight:600;font-size:13px;margin-bottom:16px}
.refresh:hover{background:#4ab0b3}
</style></head><body>
<h1>Chat Analytics Dashboard</h1>
<button class="refresh" onclick="load()">Refresh</button>
<div class="stats">
<div class="stat"><div class="num" id="total">-</div><div class="label">Total Questions</div></div>
<div class="stat"><div class="num" id="today">-</div><div class="label">Today</div></div>
<div class="stat"><div class="num" id="users">-</div><div class="label">Unique Users</div></div>
</div>
<table><thead><tr><th>Time</th><th>Question</th><th>Pages Used</th><th>IP</th></tr></thead>
<tbody id="logs"></tbody></table>
<script>
var SECRET='""" + ADMIN_SECRET + """';
function load(){
  fetch('/api/analytics?secret='+SECRET).then(r=>r.json()).then(d=>{
    document.getElementById('total').textContent=d.total_questions;
    document.getElementById('today').textContent=d.today_questions;
    document.getElementById('users').textContent=d.unique_users;
  });
  fetch('/api/analytics/logs?secret='+SECRET+'&limit=100').then(r=>r.json()).then(d=>{
    var h='';
    d.logs.forEach(function(e){
      var t=new Date(e.timestamp).toLocaleString();
      var pages=e.sources.map(function(s){return 'P'+s.page}).join(', ');
      h+='<tr><td class="time">'+t+'</td><td class="q">'+esc(e.question)+'</td><td>'+pages+'</td><td>'+e.ip+'</td></tr>';
    });
    document.getElementById('logs').innerHTML=h;
  });
}
function esc(s){var d=document.createElement('div');d.textContent=s;return d.innerHTML}
load();
</script></body></html>"""
    return Response(content=html, media_type="text/html")

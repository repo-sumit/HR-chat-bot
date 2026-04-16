"""Core RAG logic: load embeddings, retrieve chunks, stream responses via Groq."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import AsyncGenerator

import numpy as np
from google import genai

from app.config import (
    EMBEDDING_MODEL,
    EMBEDDINGS_PATH,
    GEMINI_API_KEY,
    GROQ_API_KEY,
    GROQ_MODEL,
    MAX_CONTEXT_CHUNKS,
    TEMPERATURE,
)

log = logging.getLogger(__name__)

# ── module-level store (loaded once at startup) ──────────────────────
_chunks: np.ndarray | None = None
_embeddings: np.ndarray | None = None
_metadata: np.ndarray | None = None

# Gemini client — used only for embeddings
gemini_client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None

# Groq client — used for generation
_groq_client = None

def _get_groq_client():
    global _groq_client
    if _groq_client is None:
        from groq import Groq
        _groq_client = Groq(api_key=GROQ_API_KEY)
    return _groq_client


SYSTEM_PROMPT = """\
You are a helpful support assistant. You answer questions ONLY based on the provided context from the document.

LANGUAGE RULES (VERY IMPORTANT):
- Detect the language/style the user writes in
- If they write in Hindi (Devanagari script) → respond in Hindi
- If they write in Hinglish (Hindi in English script, e.g., "mujhe batao", "kya hai ye") → respond in Hinglish
- If they write in English (even broken/informal) → respond in simple, clear English
- Match their tone — if casual, be casual. If formal, be formal.

ANSWERING RULES:
- Only answer from the provided context. Never make up information.
- If the answer is not in the context, say so honestly in the user's language.
- Keep answers concise but complete. Use bullet points for lists.
- If referencing specific information, mention the page number.
- Be friendly and helpful."""


# ── startup / teardown ───────────────────────────────────────────────

def load_embeddings(path: str = EMBEDDINGS_PATH) -> int:
    """Load the .npz file into module-level variables. Returns chunk count."""
    global _chunks, _embeddings, _metadata
    data = np.load(path, allow_pickle=True)
    _chunks = data["chunks"]
    _embeddings = data["embeddings"]
    _metadata = data["metadata"]
    log.info("Loaded %d chunks from %s", len(_chunks), path)
    return len(_chunks)


async def verify_api_key() -> bool:
    """Quick test that the Groq key works."""
    try:
        client = _get_groq_client()
        client.models.list()
        log.info("Groq API key verified, using model: %s", GROQ_MODEL)
        return True
    except Exception as exc:
        log.error("Groq API key verification failed: %s", exc)
        return False


# ── retrieval ────────────────────────────────────────────────────────

def _cosine_similarity(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Cosine similarity between vector *a* (1-D) and matrix *b* (2-D)."""
    norm_a = np.linalg.norm(a)
    norms_b = np.linalg.norm(b, axis=1)
    denom = norm_a * norms_b
    denom[denom == 0] = 1e-10
    return (b @ a) / denom


def retrieve(query_embedding: np.ndarray, top_k: int = MAX_CONTEXT_CHUNKS) -> list[dict]:
    """Return the top-k most similar chunks with scores and metadata."""
    if _embeddings is None:
        return []
    scores = _cosine_similarity(query_embedding, _embeddings)
    top_idx = np.argsort(scores)[::-1][:top_k]
    results = []
    for idx in top_idx:
        meta = json.loads(str(_metadata[idx]))
        results.append({
            "text": str(_chunks[idx]),
            "score": float(scores[idx]),
            "page": meta.get("page", 0),
        })
    return results


async def embed_query(text: str) -> np.ndarray:
    """Embed a single query string using Gemini embedding model."""
    for attempt in range(3):
        try:
            resp = gemini_client.models.embed_content(
                model=f"models/{EMBEDDING_MODEL}",
                contents=text,
            )
            return np.array(resp.embeddings[0].values, dtype=np.float32)
        except Exception as e:
            if "429" in str(e) and attempt < 2:
                wait = (attempt + 1) * 10
                log.warning("Embedding rate-limited, retrying in %ds...", wait)
                await asyncio.sleep(wait)
            else:
                raise


# ── generation (streaming via Groq) ─────────────────────────────────

def _build_messages(query: str, chunks: list[dict], history: list[dict] | None = None) -> list[dict]:
    """Build the message list for Groq chat completion."""
    context_parts = []
    for i, c in enumerate(chunks, 1):
        context_parts.append(f"[Chunk {i} | Page {c['page']}]\n{c['text']}")
    context_block = "\n\n---\n\n".join(context_parts)

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]

    if history:
        for turn in history[-6:]:
            role = "user" if turn["role"] == "user" else "assistant"
            messages.append({"role": role, "content": turn["content"]})

    user_text = f"CONTEXT FROM DOCUMENT:\n{context_block}\n\nUSER QUESTION:\n{query}"
    messages.append({"role": "user", "content": user_text})
    return messages


async def generate_response(
    query: str,
    chunks: list[dict],
    history: list[dict] | None = None,
) -> AsyncGenerator[str, None]:
    """Stream tokens from Groq."""
    messages = _build_messages(query, chunks, history)
    client = _get_groq_client()

    stream = client.chat.completions.create(
        model=GROQ_MODEL,
        messages=messages,
        temperature=TEMPERATURE,
        stream=True,
    )
    for chunk in stream:
        delta = chunk.choices[0].delta
        if delta.content:
            yield delta.content

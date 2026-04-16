"""Core RAG logic: load embeddings, retrieve chunks, stream Gemini responses."""

from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import AsyncGenerator

import numpy as np
from google import genai
from google.genai import types

from app.config import (
    EMBEDDING_MODEL,
    EMBEDDINGS_PATH,
    GEMINI_API_KEY,
    GEMINI_MODEL,
    MAX_CONTEXT_CHUNKS,
    TEMPERATURE,
)

log = logging.getLogger(__name__)

# ── module-level store (loaded once at startup) ──────────────────────
_chunks: np.ndarray | None = None
_embeddings: np.ndarray | None = None
_metadata: np.ndarray | None = None

client = genai.Client(api_key=GEMINI_API_KEY)

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
    """Quick test that the Gemini key works."""
    try:
        client.models.get(model=f"models/{GEMINI_MODEL}")
        return True
    except Exception as exc:
        log.error("Gemini API key verification failed: %s", exc)
        return False


# ── retrieval ────────────────────────────────────────────────────────

def _cosine_similarity(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Cosine similarity between vector *a* (1-D) and matrix *b* (2-D)."""
    norm_a = np.linalg.norm(a)
    norms_b = np.linalg.norm(b, axis=1)
    # guard against zero-division
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
    """Embed a single query string using Gemini embedding model, with retry on 429."""
    for attempt in range(3):
        try:
            resp = client.models.embed_content(
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


# ── generation (streaming) ───────────────────────────────────────────

def _build_prompt(query: str, chunks: list[dict], history: list[dict] | None = None) -> list[types.Content]:
    """Build the Gemini conversation contents list."""
    # Context block
    context_parts = []
    for i, c in enumerate(chunks, 1):
        context_parts.append(f"[Chunk {i} | Page {c['page']}]\n{c['text']}")
    context_block = "\n\n---\n\n".join(context_parts)

    contents: list[types.Content] = []

    # Inject previous conversation turns if provided
    if history:
        for turn in history[-6:]:  # keep last 6 turns to stay within limits
            role = "user" if turn["role"] == "user" else "model"
            contents.append(types.Content(role=role, parts=[types.Part.from_text(text=turn["content"])]))

    # Current user message with context
    user_text = (
        f"CONTEXT FROM DOCUMENT:\n{context_block}\n\n"
        f"USER QUESTION:\n{query}"
    )
    contents.append(types.Content(role="user", parts=[types.Part.from_text(text=user_text)]))
    return contents


async def generate_response(
    query: str,
    chunks: list[dict],
    history: list[dict] | None = None,
) -> AsyncGenerator[str, None]:
    """Stream tokens from Gemini for the given query + retrieved chunks, with retry on 429."""
    contents = _build_prompt(query, chunks, history)
    config = types.GenerateContentConfig(
        system_instruction=SYSTEM_PROMPT,
        temperature=TEMPERATURE,
    )
    for attempt in range(3):
        try:
            stream = client.models.generate_content_stream(
                model=f"models/{GEMINI_MODEL}",
                contents=contents,
                config=config,
            )
            for response_chunk in stream:
                if response_chunk.text:
                    yield response_chunk.text
            return  # success, exit retry loop
        except Exception as e:
            if "429" in str(e) and attempt < 2:
                wait = (attempt + 1) * 10
                log.warning("Generation rate-limited, retrying in %ds...", wait)
                await asyncio.sleep(wait)
            else:
                raise

#!/usr/bin/env python3
"""CLI script: reads a PDF, chunks it, embeds with Gemini, saves .npz."""

from __future__ import annotations

import json
import os
import sys
import time

import numpy as np

# allow running as `python scripts/ingest.py` from project root
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from dotenv import load_dotenv

load_dotenv()

import pymupdf  # PyMuPDF
from google import genai

EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "gemini-embedding-001")
OUTPUT_PATH = os.getenv("EMBEDDINGS_PATH", "data/embeddings.npz")
API_KEY = os.environ["GEMINI_API_KEY"]

client = genai.Client(api_key=API_KEY)


# ── PDF extraction ───────────────────────────────────────────────────

def extract_text(pdf_path: str) -> list[tuple[int, str]]:
    """Return list of (page_number, text) from PDF."""
    doc = pymupdf.open(pdf_path)
    pages = []
    for i, page in enumerate(doc, 1):
        text = page.get_text().strip()
        if text:
            pages.append((i, text))
    doc.close()
    return pages


# ── Chunking ─────────────────────────────────────────────────────────

def chunk_text(pages: list[tuple[int, str]], min_len: int = 200, max_len: int = 800, overlap: int = 50) -> list[dict]:
    """Split page texts into overlapping chunks of target size."""
    chunks: list[dict] = []

    for page_num, text in pages:
        # Split by double newlines (paragraphs)
        paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]

        for para in paragraphs:
            if len(para) <= max_len:
                if para:
                    chunks.append({"text": para, "page": page_num})
            else:
                # Split long paragraphs by sentence boundaries
                sentences = _split_sentences(para)
                current = ""
                for sent in sentences:
                    if len(current) + len(sent) + 1 > max_len and current:
                        chunks.append({"text": current.strip(), "page": page_num})
                        # Overlap: keep tail of previous chunk
                        current = current[-overlap:] + " " + sent if overlap else sent
                    else:
                        current = (current + " " + sent).strip() if current else sent
                if current.strip():
                    chunks.append({"text": current.strip(), "page": page_num})

    # Filter out very short chunks (noise)
    chunks = [c for c in chunks if len(c["text"]) >= 30]
    return chunks


def _split_sentences(text: str) -> list[str]:
    """Naive sentence splitter on . ? !"""
    import re
    parts = re.split(r'(?<=[.!?])\s+', text)
    return [p for p in parts if p.strip()]


# ── Embedding ────────────────────────────────────────────────────────

def embed_chunks(texts: list[str], batch_size: int = 50) -> np.ndarray:
    """Embed texts in batches, respecting rate limits (15 RPM free tier)."""
    all_embeddings: list[list[float]] = []
    total = len(texts)

    for i in range(0, total, batch_size):
        batch = texts[i : i + batch_size]
        print(f"  Embedding batch {i // batch_size + 1}/{(total + batch_size - 1) // batch_size} ({len(batch)} chunks)...")

        try:
            resp = client.models.embed_content(
                model=f"models/{EMBEDDING_MODEL}",
                contents=batch,
            )
            for emb in resp.embeddings:
                all_embeddings.append(emb.values)
        except Exception as e:
            if "429" in str(e) or "resource" in str(e).lower():
                print("  Rate limited — waiting 60s...")
                time.sleep(60)
                resp = client.models.embed_content(
                    model=f"models/{EMBEDDING_MODEL}",
                    contents=batch,
                )
                for emb in resp.embeddings:
                    all_embeddings.append(emb.values)
            else:
                raise

        # Small delay between batches to stay within 15 RPM
        if i + batch_size < total:
            time.sleep(4)

    return np.array(all_embeddings, dtype=np.float32)


# ── Main ─────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/ingest.py <path-to-pdf>")
        sys.exit(1)

    pdf_path = sys.argv[1]
    if not os.path.isfile(pdf_path):
        print(f"Error: file not found: {pdf_path}")
        sys.exit(1)

    print(f"Reading PDF: {pdf_path}")
    pages = extract_text(pdf_path)
    print(f"  Extracted text from {len(pages)} pages")

    print("Chunking text...")
    chunks = chunk_text(pages)
    print(f"  Created {len(chunks)} chunks")

    texts = [c["text"] for c in chunks]
    est_tokens = sum(len(t.split()) for t in texts)
    print(f"  Estimated tokens: ~{est_tokens}")

    print("Embedding chunks with Gemini...")
    embeddings = embed_chunks(texts)
    print(f"  Embedding shape: {embeddings.shape}")

    metadata = [json.dumps({"page": c["page"]}) for c in chunks]

    os.makedirs(os.path.dirname(OUTPUT_PATH) or ".", exist_ok=True)
    np.savez(
        OUTPUT_PATH,
        embeddings=embeddings,
        chunks=np.array(texts, dtype=object),
        metadata=np.array(metadata, dtype=object),
    )

    file_size = os.path.getsize(OUTPUT_PATH)
    print(f"\nDone! Saved to {OUTPUT_PATH}")
    print(f"  Chunks:  {len(chunks)}")
    print(f"  Tokens:  ~{est_tokens}")
    print(f"  File:    {file_size / 1024:.1f} KB")


if __name__ == "__main__":
    main()

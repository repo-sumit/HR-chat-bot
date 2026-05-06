# HR Support Bot

A production-ready, embeddable **RAG (Retrieval-Augmented Generation) chatbot** that answers questions strictly from a single ingested PDF document. Built for **ConveGenius.AI** to handle HR policy queries in **Hindi**, **Hinglish**, and **English**.

- **Live demo:** https://cg-hr-bot.vercel.app/
- **Hosted API (inferred):** https://hr-chat-bot-jr1z.onrender.com/

---

## Overview

HR Support Bot is a small but complete RAG stack that:

1. Ingests a single PDF (HR policies, handbooks, product docs, etc.) into pre-computed embeddings stored on disk (`data/embeddings.npz`).
2. Serves a FastAPI backend that exposes a streaming chat API (`POST /api/chat`), an embeddable JS widget (`GET /widget.js`), and an analytics dashboard (`GET /dashboard`).
3. Lets users open a chat bubble on any website, type a natural-language question, and receive a **streamed**, **language-matched** answer grounded only in the PDF.
4. Optionally logs every question (IP + sources used) to **Supabase** so an admin can review usage from a built-in dashboard.

### Primary user flow

1. The host webpage loads `https://<api-host>/widget.js`. The widget injects a floating chat bubble.
2. On open, the widget fires a warm-up `GET /` to wake the (potentially sleeping) Render free-tier backend.
3. The user types a message. The widget POSTs `{ message, history }` to `/api/chat` and reads a `text/event-stream` response.
4. Backend embeds the query via Gemini, retrieves the top-K most similar chunks via NumPy cosine similarity, calls Groq with a strict system prompt and the retrieved context, and streams tokens back.
5. The widget renders the streamed Markdown live; on `done` it appends the message to local in-memory history (last 6 turns reused as conversation context).
6. The backend asynchronously inserts a row into Supabase `chat_logs` for the analytics dashboard.

---

## Key Features

- **Single-PDF RAG** — text extracted with PyMuPDF, paragraph/sentence-level chunking with overlap, Gemini embeddings, NumPy cosine similarity retrieval.
- **Streaming responses** — FastAPI Server-Sent Events (`text/event-stream`) stream Groq tokens directly to the browser.
- **Language auto-detect** — system prompt instructs the model to detect Hindi (Devanagari), Hinglish (romanized Hindi), or English and respond in kind.
- **Embeddable widget** — single `<script>` tag drops a styled chat bubble onto any HTML page; data-attributes customize bot name, accent color, greeting, and position (`bottom-right` / `bottom-left`).
- **Mobile responsive** — at ≤480 px the chat window goes full-screen and the bubble auto-hides while open.
- **Lightweight Markdown renderer** (in-browser) — supports `#`/`##`/`###`, `**bold**`, `*italic*`, and `*`/`-` bullet lists.
- **In-memory IP rate limiting** — 30 requests / 60 s per IP, with periodic cleanup of stale entries.
- **Friendly error mapping** — backend converts upstream 429/503/`API_KEY_INVALID` errors to user-safe messages, parsing retry delays where present.
- **Auto-retry on cold start** — widget retries up to 3 times (5 s, 10 s, 15 s) with a "Server is waking up…" status when fetch fails.
- **Self-ping keep-alive** — backend pings `RENDER_EXTERNAL_URL/` every 5 minutes to fight Render's 15-minute idle sleep.
- **Conversation context** — last 6 turns of the user's local history are sent with each request (no server-side session store).
- **Supabase chat logging** — fire-and-forget async POST to `chat_logs`; failures are logged but never break the user request.
- **Built-in analytics dashboard** — `/dashboard?secret=…` renders an inline HTML page with totals, today's count, unique IPs, and a table of recent questions.
- **Supabase diagnostic CLI** — `scripts/check_supabase.py` validates env vars, key type (legacy JWT vs `sb_secret_`/`sb_publishable_`), read access, and insert access — emitting actionable hints (RLS, missing table, schema mismatch).
- **CORS open by default** — `ALLOWED_ORIGINS=*` so the widget can be embedded anywhere; tighten in production.
- **Zero heavy dependencies** — no LangChain, no vector DB, no frontend framework.

---

## Tech Stack

| Layer | Technology | Notes |
|-------|------------|-------|
| Backend framework | **Python 3.11 + FastAPI 0.115.6** | Async, SSE streaming via `StreamingResponse`. |
| ASGI server | **uvicorn[standard] 0.34.0** | Bound to `0.0.0.0:8000` in Docker. |
| LLM (generation) | **Groq** SDK 1.1.2, default model `llama-3.3-70b-versatile` | Streaming chat completions. |
| Embeddings | **Google Gemini** via `google-genai` 1.14.0, model `gemini-embedding-001` | Used at both ingest and query time. |
| Vector store | **NumPy 2.2.3** cosine similarity over `data/embeddings.npz` | No external vector DB. |
| PDF parsing | **PyMuPDF 1.25.3** (`pymupdf`) | Text-only extraction (no images/tables). |
| HTTP client | **httpx** (transitively via `fastapi`) | Async client for Supabase + keep-alive. |
| Env loading | **python-dotenv 1.1.0** | `.env` loaded in `app/config.py` and `scripts/ingest.py`. |
| Chat logging | **Supabase** (PostgreSQL REST API) | Optional; skipped if `SUPABASE_URL` empty. |
| Frontend (demo) | Static `index.html` + Google Fonts (Inter) | Branded ConveGenius.AI landing page. |
| Frontend (widget) | Vanilla JS, scoped CSS, no build step | Single ~15 KB file at `app/static/widget.js`. |
| Containerization | **Docker** (`python:3.11-slim`) | Used by Render. |
| API hosting | **Render.com** (Docker, free plan) | `render.yaml` declares the web service. |
| Static hosting | **Vercel** (and/or Netlify) | `vercel.json` serves `index.html` at `/`. |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  Host site (e.g. cg-hr-bot.vercel.app)                            │
│   <script src="https://<api>/widget.js"></script>                 │
│        │                                                          │
│        ▼                                                          │
│   widget.js (chat bubble, SSE reader, markdown renderer)          │
└────────────┬──────────────────────────────────────────────────────┘
             │  POST /api/chat  (SSE response)
             ▼
┌──────────────────────────────────────────────────────────────────┐
│  FastAPI backend (Render, Docker)                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐    │
│  │  app.main    │  │  app.rag     │  │  app.config          │    │
│  │  routes,     │  │  embed/      │  │  env vars            │    │
│  │  CORS, SSE,  │─▶│  retrieve/   │  └──────────────────────┘    │
│  │  rate limit, │  │  generate    │                              │
│  │  analytics   │  └─────┬────────┘                              │
│  └────┬─────────┘        │                                       │
│       │                  │                                       │
│       │            ┌─────▼─────┐    ┌──────────────────────┐    │
│       │            │ Gemini    │    │ Groq                 │    │
│       │            │ embeddings│    │ llama-3.3-70b-...    │    │
│       │            └───────────┘    └──────────────────────┘    │
│       │                                                          │
│       │  insert {ip, question, sources}                          │
│       ▼                                                          │
│  ┌────────────────────────┐                                      │
│  │ Supabase chat_logs     │◀── /dashboard?secret=… reads it     │
│  └────────────────────────┘                                      │
└──────────────────────────────────────────────────────────────────┘

Offline (one-shot, before deploy):
  scripts/ingest.py <pdf>
    PDF → pages → chunks → Gemini embeddings → data/embeddings.npz
```

### Directory structure

```
HR-Support-Bot/
├── app/
│   ├── __init__.py            # marks app as a package
│   ├── config.py              # reads env vars (.env loaded via python-dotenv)
│   ├── main.py                # FastAPI app, routes, SSE, rate limit, analytics
│   ├── rag.py                 # load embeddings, retrieval, Gemini embed, Groq stream
│   └── static/
│       └── widget.js          # embeddable chat widget (vanilla JS, scoped CSS)
├── scripts/
│   ├── ingest.py              # CLI: PDF → chunks → embeddings → .npz
│   └── check_supabase.py      # diagnostic: verifies Supabase chat_logs insert path
├── data/
│   ├── .gitkeep
│   ├── embeddings.npz         # pre-computed embeddings (committed; ~2.3 MB in repo)
│   └── test.pdf               # sample/test PDF
├── index.html                 # branded demo landing page (loads widget.js)
├── requirements.txt
├── Dockerfile                 # python:3.11-slim, runs uvicorn on :8000
├── render.yaml                # Render web service (docker, free plan)
├── vercel.json                # static-site routing for index.html
├── .env                       # local secrets (gitignored)
├── .gitignore
└── README.md
```

### Key modules

- **`app/main.py`**
  - FastAPI app, CORS middleware (`ALLOWED_ORIGINS`), startup hook that loads embeddings and verifies the Groq key, shutdown hook that closes the Supabase client.
  - In-memory rate limiter (`_rate_store`, 30 req / 60 s) with `_cleanup_rate_store()` triggered when the dict grows past 500 IPs.
  - `_friendly_error()` regex-maps upstream errors (`429`, `RESOURCE_EXHAUSTED`, `API_KEY_INVALID`, `503`, `UNAVAILABLE`) to user-safe text.
  - `_keep_alive()` background task pings `SELF_PING_URL/` every 300 s (started in `startup`).
  - Routes:
    - `GET /` — health (`{status:"ok", bot_name:…}`).
    - `POST /api/chat` — SSE stream of `{token, done, sources?, error?}`.
    - `GET /widget.js` — reads `app/static/widget.js`, replaces `__API_BASE_URL__`, `__BOT_NAME__`, `__BOT_GREETING__` placeholders, and serves with `application/javascript`.
    - `GET /api/analytics` — totals + today's count + unique IPs (counts via PostgREST `Prefer: count=exact`, `Range: 0-0`).
    - `GET /api/analytics/logs` — paginated raw log rows (default `limit=50`).
    - `GET /dashboard` — server-rendered HTML dashboard (Inter font, ConveGenius palette).
- **`app/rag.py`**
  - Module-level `_chunks`, `_embeddings`, `_metadata` arrays loaded once at startup from `EMBEDDINGS_PATH`.
  - `_cosine_similarity(a, b)` — pure NumPy, with a `1e-10` denominator floor.
  - `retrieve(query_emb, top_k=MAX_CONTEXT_CHUNKS)` — argsort scores, returns `[{text, score, page}]`.
  - `embed_query(text)` — Gemini embed with up-to-3 retries on `429` (back-off `(attempt+1)*10` s).
  - `_build_messages(query, chunks, history)` — joins context with `[Chunk i | Page p]` headers, prepends the system prompt and last 6 history turns, ends with a `CONTEXT FROM DOCUMENT:\n…\nUSER QUESTION:\n…` user message.
  - `generate_response()` — async generator that streams `delta.content` from Groq.
  - `SYSTEM_PROMPT` enforces: answer only from context, language matching, concise, **never mention page numbers/sources**.
- **`app/config.py`** — single source of truth for env vars (defaults below).
- **`scripts/ingest.py`** — `extract_text` → `chunk_text` (paragraph split, then sentence-split if `>800` chars, with `50` char overlap, drop chunks `<30` chars) → `embed_chunks` (batch size 50, sleep 4 s between batches, 60 s back-off on 429) → `np.savez(embeddings, chunks, metadata)`.
- **`scripts/check_supabase.py`** — interactive diagnostic; detects key prefix (`sb_secret_`, `sb_publishable_`, legacy JWT) and decodes JWT to identify role.
- **`app/static/widget.js`** — IIFE that injects scoped CSS (Inter font, ConveGenius palette by default), DOM, SSE reader, lightweight Markdown renderer, retry loop, history buffer.

---

## Business Logic / Application Logic

### Ingestion (one-shot)

1. `pymupdf.open(pdf_path)` → iterate pages, `page.get_text()`, drop empty pages.
2. **Chunking** (`chunk_text`):
   - Split each page on blank lines into paragraphs.
   - If `len(para) ≤ 800`: keep as-is.
   - Else: `_split_sentences` on `.!?`; greedily pack sentences up to `max_len=800`. When a chunk closes, the **last 50 chars** of the previous chunk are prepended to the next (overlap).
   - Drop any chunk shorter than **30 chars** (filters page numbers / page footers / noise).
3. **Embedding** (`embed_chunks`): Gemini `gemini-embedding-001`, batches of 50, `time.sleep(4)` between batches to stay under the 15 RPM Gemini free tier, single 60-second retry on a 429.
4. **Persistence**: `np.savez(OUTPUT_PATH, embeddings=…, chunks=…, metadata=…)` where `metadata[i]` is `json.dumps({"page": page_num})`.

### Query path

1. Browser → `POST /api/chat { message, history[] }`.
2. Per-IP rate-limit check (30/60 s, in-memory). Over limit ⇒ `429`.
3. Empty `message` ⇒ `400`.
4. `embed_query` → 768-dim float32 vector.
5. `retrieve` → top-`MAX_CONTEXT_CHUNKS` (default 4) by cosine similarity.
6. `sources = [{page, score(rounded 3dp)}]` is sent to **Supabase** (fire-and-forget) and emitted in the final SSE event.
7. `generate_response` builds messages (system + last 6 history turns + context+question user message) and `client.chat.completions.create(stream=True)` on Groq.
8. Each delta becomes one SSE frame: `data: {"token": "…", "done": false}\n\n`. On natural end: `data: {"token":"", "done":true, "sources":[…]}\n\n`. On exception: `…"error": "<friendly>"…`.

### Conversation memory

Server is **stateless** between requests: every call carries `history` from the widget, and only the **last 6** turns are forwarded to the LLM (`history[-6:]`). Refreshing the page wipes history.

### Rate limiting

`_rate_store: dict[ip, list[float]]`. On each request, prune timestamps older than `RATE_WINDOW=60.0`s. If `len ≥ RATE_LIMIT=30`, return 429. Cleanup of dead IPs runs whenever the store grows past 500 entries.

### Keep-alive

Render free-tier instances sleep after ~15 min of inactivity. `_keep_alive()` pings `RENDER_EXTERNAL_URL` (or the hardcoded fallback `https://hr-chat-bot-jr1z.onrender.com`) every 300 s starting 10 s after startup.

### Error handling

- `_friendly_error(exc)` translates exception strings to user-safe messages and parses `retry in N` patterns out of Gemini/Groq quota errors.
- `log_chat` swallows all exceptions and logs a warning — Supabase outages never block a user request.
- `verify_api_key` runs at startup and only **logs** a failure; the app still serves `/` (allowing the widget warm-up ping to succeed).

### Widget retry / warm-up

- On script load and on every chat-window open: `fetch(API + "/")` to wake the server.
- On chat fetch failures matching `failed to fetch` / `network` / `load failed` / `timeout`: up to 3 retries with delays `[5 s, 10 s, 15 s]` and an italic teal status message ("Server is waking up… attempt N/4"). After exhaustion, the widget shows a friendly red error.

---

## API Documentation

All routes are mounted at the root of the FastAPI app (defined in [app/main.py](app/main.py)).

### `GET /`
Health check / warm-up.

**Response 200** — `application/json`
```json
{ "status": "ok", "bot_name": "HR Support Bot" }
```

---

### `POST /api/chat`
Streaming chat endpoint (Server-Sent Events).

**Request body** — `application/json`
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `message` | string | ✅ | User question. Whitespace-trimmed; empty → 400. |
| `history` | array of `{role, content}` | ❌ | Recent conversation. Server uses only the last 6 entries. |

**Response 200** — `text/event-stream`. Each frame:
```
data: {"token":"<delta>","done":false}

data: {"token":"","done":true,"sources":[{"page":3,"score":0.812}, ...]}
```
On error:
```
data: {"token":"","done":true,"sources":[],"error":"<friendly message>"}
```

**Response 400** — `{"error":"Empty message"}`
**Response 429** — `{"error":"Rate limit exceeded. Please wait a moment."}`
**Response 500** — `{"error":"<friendly message>"}` (retrieval failure)

---

### `GET /widget.js`
Returns the embeddable widget JS with `__API_BASE_URL__`, `__BOT_NAME__`, `__BOT_GREETING__` placeholders substituted from the request URL and config. `Content-Type: application/javascript`.

---

### `GET /api/analytics?secret=…`
Admin-only summary stats. Requires `secret == ADMIN_SECRET`, else **401**.

**Response 200**
```json
{ "total_questions": 1234, "unique_users": 217, "today_questions": 42 }
```
*Implementation note:* counts use Supabase PostgREST `Prefer: count=exact` with `Range: 0-0`. `unique_users` selects every `ip` row and dedupes in Python (acceptable for the free-tier scale of 50 K rows; **inferred** to scale linearly with row count).

---

### `GET /api/analytics/logs?secret=…&limit=50&offset=0`
Admin-only log listing. Requires `secret == ADMIN_SECRET`, else **401**.

**Response 200**
```json
{
  "total": 1234,
  "logs": [
    {
      "id": 99,
      "timestamp": "2026-05-06T10:21:55.000Z",
      "ip": "203.0.113.4",
      "question": "What is the leave policy?",
      "sources": [{"page": 3, "score": 0.81}]
    }
  ]
}
```
- `created_at` is renamed to `timestamp` for dashboard compatibility.
- `sources` is parsed from the JSON-string column back to an array.

---

### `GET /dashboard?secret=…`
Renders an inline HTML dashboard (Inter font, ConveGenius palette) with the three KPI cards and a paginated-by-100 question table. The secret is interpolated into the page's `SECRET` JS variable, so don't share dashboard URLs broadly.

---

## Data Model / Database

### Embeddings file (on disk) — `data/embeddings.npz`

Three parallel arrays of length `N` (number of retained chunks) created by `scripts/ingest.py` (see [scripts/ingest.py:153](scripts/ingest.py:153)):

| Key | dtype | Shape | Content |
|-----|-------|-------|---------|
| `embeddings` | `float32` | `(N, D)` | Gemini `gemini-embedding-001` vectors. |
| `chunks` | `object` (str) | `(N,)` | Raw chunk text. |
| `metadata` | `object` (str) | `(N,)` | JSON-encoded `{"page": <int>}` per chunk. |

### Supabase — `chat_logs` table

Schema expected by [app/main.py:62](app/main.py:62) and [scripts/check_supabase.py](scripts/check_supabase.py):

```sql
CREATE TABLE chat_logs (
  id          BIGSERIAL    PRIMARY KEY,
  created_at  TIMESTAMPTZ  DEFAULT NOW(),
  ip          TEXT,
  question    TEXT,
  sources     TEXT          -- JSON-string of [{page, score}]
);
```

Notes:
- `sources` is stored as a **JSON string**, not `jsonb`; the dashboard parses it back to JSON.
- The app uses `Prefer: return=minimal` on inserts and `Prefer: count=exact, Range: 0-0` on count queries.
- An **insert policy** is required if you use a publishable/anon key (RLS-on by default in new Supabase projects). The diagnostic script flags this case — easiest fix is the `service_role` (`sb_secret_…`) key for the bot.

### In-memory state (process-local)

- `app.rag._chunks`, `_embeddings`, `_metadata` — loaded once at startup.
- `app.main._rate_store: dict[str, list[float]]` — per-IP request timestamps.
- `app.main._supabase_client: httpx.AsyncClient` — lazily created on first `log_chat` call.

There is **no other persistent database** in this project.

---

## Environment Variables

All variables are read in [app/config.py](app/config.py) (loaded via `python-dotenv`). Ingestion (`scripts/ingest.py`) only needs `GEMINI_API_KEY`, `EMBEDDING_MODEL`, `EMBEDDINGS_PATH`. The diagnostic script needs the two `SUPABASE_*` vars.

| Variable | Required | Default | Purpose | Used in |
|----------|----------|---------|---------|---------|
| `GEMINI_API_KEY` | ✅ | *(empty)* | Google AI Studio key for the embedding model. | `app/rag.py`, `scripts/ingest.py` |
| `GROQ_API_KEY` | ✅ | *(empty)* | Groq cloud key for chat generation. | `app/rag.py` |
| `GROQ_MODEL` | ❌ | `llama-3.3-70b-versatile` | Groq model id. | `app/rag.py` |
| `EMBEDDING_MODEL` | ❌ | `gemini-embedding-001` | Gemini embedding model id. | `app/rag.py`, `scripts/ingest.py` |
| `GEMINI_MODEL` | ❌ | `gemini-2.0-flash` | Declared in config but **not currently consumed** by the runtime (generation is via Groq). | `app/config.py` (inferred unused) |
| `EMBEDDINGS_PATH` | ❌ | `data/embeddings.npz` | Path to the `.npz` artifact loaded at startup. | `app/rag.py`, `scripts/ingest.py` |
| `MAX_CONTEXT_CHUNKS` | ❌ | `4` | Top-K chunks retrieved per query. | `app/rag.py` |
| `TEMPERATURE` | ❌ | `0.3` | Groq sampling temperature. | `app/rag.py` |
| `BOT_NAME` | ❌ | `Support Bot` | Header label and `__BOT_NAME__` widget placeholder. | `app/main.py`, widget |
| `BOT_GREETING` | ❌ | `Hi! Ask me anything. I understand Hindi, Hinglish & English.` | First widget message. | `app/main.py`, widget |
| `ALLOWED_ORIGINS` | ❌ | `*` | Comma-separated CORS origins. | `app/main.py` |
| `ADMIN_SECRET` | ❌ | `changeme123` | Secret query param for `/dashboard`, `/api/analytics`, `/api/analytics/logs`. **Change in production.** | `app/main.py` |
| `SUPABASE_URL` | ❌ | *(empty)* | Project URL, e.g. `https://abcd.supabase.co`. If empty, logging is silently skipped. | `app/main.py`, diagnostic |
| `SUPABASE_KEY` | ❌ | *(empty)* | API key. Use a `sb_secret_…` key (or legacy `service_role` JWT) to bypass RLS. | `app/main.py`, diagnostic |
| `RENDER_EXTERNAL_URL` | ❌ | `https://hr-chat-bot-jr1z.onrender.com` (hardcoded fallback) | URL the keep-alive task pings. Render sets this automatically. | `app/main.py` |

> ⚠️ **Never commit `.env`.** It is already in `.gitignore`. The default `ADMIN_SECRET=changeme123` must be overridden in any deployed environment.

---

## Installation

### Prerequisites

- **Python 3.11+** (Docker uses `python:3.11-slim`).
- **A PDF document** to ingest.
- A **Groq** API key (https://console.groq.com/keys).
- A **Gemini** API key (https://aistudio.google.com/apikey).
- *(Optional)* A **Supabase** project for chat logging.

### Step 1 — Clone & install

```bash
git clone https://github.com/<your-org>/HR-Support-Bot.git
cd HR-Support-Bot
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
```

### Step 2 — Configure `.env`

Create a `.env` in the repo root (this file is gitignored):

```env
GEMINI_API_KEY=your_gemini_key
GROQ_API_KEY=your_groq_key
GROQ_MODEL=llama-3.3-70b-versatile
BOT_NAME=HR Support Bot
BOT_GREETING=Hi! Ask me anything about HR policies.
ADMIN_SECRET=replace_me_with_a_random_string
ALLOWED_ORIGINS=https://your-frontend.example,https://another.example

# Optional — Supabase logging
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_KEY=sb_secret_xxx_or_service_role_jwt
```

### Step 3 — Create the Supabase table (optional)

```sql
CREATE TABLE chat_logs (
  id          BIGSERIAL    PRIMARY KEY,
  created_at  TIMESTAMPTZ  DEFAULT NOW(),
  ip          TEXT,
  question    TEXT,
  sources     TEXT
);
-- If you use an anon/publishable key, also add an INSERT policy.
```

Verify end-to-end:

```bash
python scripts/check_supabase.py
```

### Step 4 — Ingest your PDF

```bash
python scripts/ingest.py "path/to/your-document.pdf"
```

This produces `data/embeddings.npz` (overwrites any existing file). The script prints chunk counts, an estimated token count, and the file size.

### Step 5 — Run locally

```bash
python -m uvicorn app.main:app --reload --port 8000
```

Open `index.html` directly in your browser (or via `python -m http.server`) — the widget will hit the URL embedded in `<script src=…>`. To point the demo page at your **local** backend, edit the last `<script>` tag of [index.html](index.html) to `http://localhost:8000/widget.js`.

---

## Running the Project

| Task | Command |
|------|---------|
| Start dev server (auto-reload) | `python -m uvicorn app.main:app --reload --port 8000` |
| Start prod server | `python -m uvicorn app.main:app --host 0.0.0.0 --port 8000` |
| Build & run via Docker | `docker build -t hr-support-bot . && docker run --env-file .env -p 8000:8000 hr-support-bot` |
| Re-ingest a PDF | `python scripts/ingest.py "path/to/document.pdf"` |
| Verify Supabase setup | `python scripts/check_supabase.py` |
| Health check | `curl http://localhost:8000/` |
| Quick chat test | `curl -N -X POST http://localhost:8000/api/chat -H "Content-Type: application/json" -d '{"message":"What is the leave policy?","history":[]}'` |

> **Inferred:** there is no `Makefile`, no test suite, no linter config, and no formatter config in this repo. Add `pytest`, `ruff`, or `black` if you need them.

---

## Testing

**Not found in the current repository.** No `tests/`, `pytest.ini`, `tox.ini`, or CI test workflow exists.

Manual verification commands:

```bash
# 1. Health
curl http://localhost:8000/

# 2. Streaming chat (note -N for unbuffered SSE)
curl -N -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"hello","history":[]}'

# 3. Widget JS substitution
curl http://localhost:8000/widget.js | head -20

# 4. Analytics (replace SECRET)
curl "http://localhost:8000/api/analytics?secret=$ADMIN_SECRET"

# 5. Supabase end-to-end
python scripts/check_supabase.py
```

`data/test.pdf` is committed and can be used as an ingest sample.

---

## Deployment

### Backend → Render (Docker, free)

1. Push to GitHub with `data/embeddings.npz` committed (the bot loads this at startup).
2. Render → **New Web Service** → connect repo. Render auto-detects [render.yaml](render.yaml) and [Dockerfile](Dockerfile).
3. In the dashboard add env vars: `GEMINI_API_KEY`, `GROQ_API_KEY`, `GROQ_MODEL`, `BOT_NAME`, `BOT_GREETING`, `ADMIN_SECRET`, `ALLOWED_ORIGINS`, plus optional `SUPABASE_URL`/`SUPABASE_KEY`. (`render.yaml` only declares `GEMINI_API_KEY` with `sync:false` — the rest are set in the UI.)
4. Deploy. The keep-alive task will start pinging `RENDER_EXTERNAL_URL` every 5 minutes.

> **Important:** `render.yaml` is currently **minimal** — only `GEMINI_API_KEY` is wired. All other vars must be added in the Render dashboard or by extending the YAML.

### Frontend → Vercel / Netlify (static)

1. Connect the same repo. Framework: **Other**. Output directory: `.`.
2. [vercel.json](vercel.json) routes `/` to `index.html`. Deploy.
3. Open the deployed URL — the widget loads from the URL hardcoded in the last `<script>` tag of [index.html:304](index.html:304). **Update this URL to your own Render service** before deploying.

### Embed on any site

```html
<script src="https://your-bot.onrender.com/widget.js"></script>
```

Optional data-attributes:

| Attribute | Default | Purpose |
|-----------|---------|---------|
| `data-bot-name` | `__BOT_NAME__` (server default) | Header label. |
| `data-greeting` | `__BOT_GREETING__` (server default) | First message. |
| `data-accent-color` | `#2D2B7F` | Primary theme color (hex). |
| `data-position` | `bottom-right` | `bottom-right` or `bottom-left`. |
| `data-api-url` | served URL | Override the API base. |

### Updating the document

```bash
python scripts/ingest.py "path/to/new-doc.pdf"
git add data/embeddings.npz
git commit -m "Update embeddings"
git push   # Render auto-redeploys
```

---

## Security / Permissions

- **No user authentication** on `/api/chat` — anyone with the widget URL can ask questions.
- **Rate limiting** is in-memory and per-IP, 30 req/60 s ([app/main.py:75](app/main.py:75)). Reverse proxies / Cloudflare see one IP per CDN edge — consider a real rate-limit layer for serious deployments.
- **CORS** defaults to `*`; lock down via `ALLOWED_ORIGINS` in production.
- **Admin endpoints** (`/dashboard`, `/api/analytics*`) authorize via a `secret` query param compared against `ADMIN_SECRET` ([app/main.py:248](app/main.py:248)). The secret is rendered into the dashboard HTML, so **don't share dashboard URLs** and **change the default `changeme123`**.
- **Supabase** writes happen with whatever key you provide. Prefer a `sb_secret_…` (service-role) key on the **server** so RLS doesn't block inserts; never expose service-role keys to the browser.
- **Input validation** is light: `message` is trimmed and rejected if empty; `history` is loosely typed (`list[dict]`) and only the last 6 turns are forwarded.
- **No file uploads** are accepted at runtime — ingestion is operator-only via CLI.
- **Prompt injection** is not specifically defended against; the system prompt instructs the model to answer only from context, but the model still receives the user's literal text.

---

## Error Handling & Logging

- Python `logging` configured at INFO with `%(asctime)s %(levelname)s %(name)s: %(message)s` ([app/main.py:24](app/main.py:24)).
- `verify_api_key()` runs at startup and **logs** (not raises) on failure.
- `_friendly_error()` produces user-safe strings; raw exceptions go to `log.exception(...)`.
- `log_chat()` swallows all exceptions and logs a warning — Supabase outages do not affect end-users.
- The widget renders backend errors inline (red bubble) and retries network errors up to 3× with exponential-ish back-off (5 s → 10 s → 15 s).
- No centralized monitoring / APM is wired in. Logs go to stdout / Render's log stream only.

---

## Known Constraints

- **Single-PDF support** — re-ingesting overwrites the previous corpus; no multi-doc store.
- **No multi-tenancy** — one corpus, one bot, one admin secret per deployment.
- **Stateless server** — no per-user accounts, no cross-session memory; refresh = clean slate.
- **Render free tier cold starts** — 30–60 s on first hit when the keep-alive misses; mitigated by warm-up ping + retry loop.
- **In-memory rate limit** — resets on every redeploy; multi-instance scaling would need an external store.
- **`unique_users` analytic** loads all `ip` rows then dedupes in Python — fine at 50 K rows, painful beyond that.
- **No image / table / OCR extraction** — `PyMuPDF.get_text()` only.
- **Embedding-model lock-in** — switching `EMBEDDING_MODEL` requires re-ingesting; old vectors won't match.
- **Chunking is naive** — paragraph + sentence with character thresholds. Long bullet lists or tables can chunk poorly.
- **Gemini free tier** — 1,500 req/day; ingestion sleeps 4 s between batches and retries once on 429.
- **Groq free tier** — 30 req/min, 14,400 req/day per Groq's published limits at time of writing.
- **`render.yaml` is minimal** — only declares `GEMINI_API_KEY`; the rest of the env vars must be added in the Render UI (easy to forget).
- **`GEMINI_MODEL` env var is unused at runtime** — generation is via Groq. Left in `app/config.py` for forward-compat.
- **Widget renders Markdown via regex** — small surface area, no syntax-highlighting, no tables.

> *No `TODO`/`FIXME` comments were found in the source files.*

---

## Future Improvements

1. **Persistent rate-limiter** (Redis / Supabase) to survive redeploys and scale across instances.
2. **Pluggable vector store** so corpora >1,000 chunks can use a real ANN index (FAISS, Qdrant, pgvector) — keep NumPy as the small-mode default.
3. **Multi-document support** with per-document namespaces and a dropdown in the widget.
4. **Streaming SSE through reverse proxies** — verify `Cache-Control: no-cache, X-Accel-Buffering: no` headers in production behind any CDN.
5. **Test suite** — at minimum `pytest` covering `_cosine_similarity`, `_friendly_error`, `chunk_text`, `_build_messages`.
6. **Lint/format config** — `ruff` + `black` + a pre-commit hook.
7. **Auth layer** for `/dashboard` (HTTP basic, OAuth, or signed cookies) instead of a query-param secret.
8. **Structured logs / metrics** — JSON logs and a `/metrics` endpoint for Prometheus / Render's metrics.
9. **CI** — GitHub Actions to lint, test, and (optionally) re-ingest on PDF changes.
10. **Decouple `index.html`** from a hardcoded API URL ([index.html:304](index.html:304)) — make it env-templated like the widget.
11. **Better chunking** — semantic / recursive splitter, table extraction (camelot, tabula), OCR fallback (Tesseract) for scanned PDFs.
12. **Memory of past sessions** keyed by IP or anonymous client id (with consent banner).
13. **Per-message guardrails** — moderation, profanity filters, prompt-injection detection.
14. **Wire `render.yaml`** to declare all required env vars (with `sync:false`) so Render redeploys are reproducible.

---

## Contribution Guidelines

> *No `CONTRIBUTING.md` exists in the repo. The following is suggested.*

- **Branches:** create feature branches off `main` (`feat/...`, `fix/...`, `docs/...`).
- **Commits:** short, imperative messages (e.g., `add supabase diagnostic script`).
- **PRs:** describe the change, why it's needed, and how to test it. Include screenshots for widget changes.
- **Style:** keep the codebase dependency-light; avoid pulling in LangChain or vector DBs without discussion.
- **Secrets:** never commit `.env`, API keys, or Supabase URLs. The `.env` pattern is already gitignored.
- **Re-ingestion:** if you change `EMBEDDING_MODEL`, regenerate `data/embeddings.npz` in the same PR.
- **Testing locally:** at minimum, run the manual verification commands above before requesting review.

---

## License

MIT (inferred from the prior README — no `LICENSE` file is present in the repository).

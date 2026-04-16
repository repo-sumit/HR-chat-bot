# HR Support Bot

A production-ready, embeddable RAG (Retrieval-Augmented Generation) chatbot that answers questions from PDF documents. Built for ConveGenius.AI to handle HR policy queries in Hindi, Hinglish, and English.

Live demo: [hr-support-bot.netlify.app](https://hr-support-bot.netlify.app)

## What It Does

- Upload any PDF (HR policies, product docs, company handbook, etc.)
- Users ask questions in natural language via a chat widget
- Bot answers ONLY from the document, with page references
- Supports Hindi, Hinglish, and English - detects language automatically

## Tech Stack

| Component | Technology | Why This Choice |
|-----------|-----------|----------------|
| Backend | Python 3.11 / FastAPI | Async support, lightweight, great for APIs |
| LLM (Generation) | Groq (Llama 3.3 70B) | Free tier with 14,400 req/day, very fast inference |
| Embeddings | Google Gemini (gemini-embedding-001) | Free, high-quality embeddings for semantic search |
| Vector Search | NumPy cosine similarity | No external DB needed, works for small-medium docs |
| PDF Parsing | PyMuPDF | Fast, reliable PDF text extraction |
| Frontend | Vanilla JS widget | Zero dependencies, embeddable on any website |
| Chat Logging | Supabase (PostgreSQL) | Free tier, persistent storage, easy dashboard |
| Hosting (API) | Render.com | Free tier with Docker support |
| Hosting (Frontend) | Vercel / Netlify | Free static site hosting |

### Why Not LangChain / Pinecone / ChromaDB?

This project intentionally avoids heavy frameworks:

- **No LangChain** - adds complexity without value for a single-PDF use case
- **No vector database** - NumPy cosine similarity is sufficient for <1000 chunks. A vector DB adds cost and infrastructure for no benefit at this scale
- **No frontend framework** - the widget is a single JS file that works on any website via a script tag

## First-Time Setup

### Prerequisites

- Python 3.11+
- A PDF document to ingest
- Free API keys (instructions below)

### Step 1: Clone and Install

```bash
git clone https://github.com/YOUR_USERNAME/HR-Support-Bot.git
cd HR-Support-Bot
pip install -r requirements.txt
```

### Step 2: Get API Keys (All Free)

**Groq API Key** (for chat generation):
1. Go to [console.groq.com/keys](https://console.groq.com/keys)
2. Sign up (free, no credit card)
3. Create an API key

**Gemini API Key** (for embeddings only):
1. Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. Create a key in a new project

**Supabase** (optional, for chat logging):
1. Go to [supabase.com](https://supabase.com)
2. Create a project
3. Create a `chat_logs` table:
```sql
CREATE TABLE chat_logs (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  ip TEXT,
  question TEXT,
  sources TEXT
);
```
4. Get Project URL and anon key from Settings > API

### Step 3: Configure Environment

Create a `.env` file in the project root:

```env
GEMINI_API_KEY=your_gemini_key
GROQ_API_KEY=your_groq_key
GROQ_MODEL=llama-3.3-70b-versatile
BOT_NAME=HR Support Bot
BOT_GREETING=Hi! Ask me anything about HR policies.
ADMIN_SECRET=your_secret_here

# Optional: Supabase for chat logging
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_anon_key
```

### Step 4: Ingest Your PDF

```bash
python scripts/ingest.py "path/to/your-document.pdf"
```

This reads the PDF, chunks it, generates embeddings, and saves to `data/embeddings.npz`.

### Step 5: Run Locally

```bash
python -m uvicorn app.main:app --reload --port 8000
```

Open `index.html` in your browser and click the chat bubble.

## Updating Data

To update with a new or modified PDF:

```bash
# Re-run ingestion (overwrites existing embeddings)
python scripts/ingest.py "path/to/updated-document.pdf"

# Commit and push to trigger redeployment
git add data/embeddings.npz
git commit -m "Update embeddings with new PDF"
git push
```

Render will auto-redeploy with the new data.

## Deployment

### Backend (Render - Free)

1. Push code to GitHub (make sure `data/embeddings.npz` is committed)
2. Go to [render.com](https://render.com) > New Web Service > connect your repo
3. Render auto-detects `render.yaml` and `Dockerfile`
4. Add environment variables:
   - `GEMINI_API_KEY`
   - `GROQ_API_KEY`
   - `GROQ_MODEL` = `llama-3.3-70b-versatile`
   - `BOT_NAME`
   - `BOT_GREETING`
   - `ADMIN_SECRET`
   - `SUPABASE_URL` (optional)
   - `SUPABASE_KEY` (optional)
5. Deploy - you get a URL like `https://your-bot.onrender.com`

### Frontend (Vercel or Netlify - Free)

1. Connect the same repo to Vercel/Netlify
2. Set Framework to `Other`, Output Directory to `.`
3. Deploy - serves `index.html` as a static site

### Embed on Any Website

Add this single line to any HTML page:

```html
<script src="https://your-bot.onrender.com/widget.js"></script>
```

#### Customize the Widget

```html
<script
  src="https://your-bot.onrender.com/widget.js"
  data-bot-name="My Support Bot"
  data-accent-color="#2D2B7F"
  data-greeting="Hi! Ask me anything."
  data-position="bottom-right"
></script>
```

| Attribute | Default | Description |
|-----------|---------|-------------|
| `data-bot-name` | Support Bot | Name shown in header |
| `data-accent-color` | #2D2B7F | Primary theme color (hex) |
| `data-greeting` | Hi! Ask me anything... | First message shown |
| `data-position` | bottom-right | `bottom-right` or `bottom-left` |

## Analytics Dashboard

View user questions and usage stats:

```
https://your-bot.onrender.com/dashboard?secret=YOUR_ADMIN_SECRET
```

Shows: total questions, today's count, unique users, and full question log with timestamps.

API endpoints:
- `GET /api/analytics?secret=...` - summary stats
- `GET /api/analytics/logs?secret=...&limit=50` - question log

## Configuration Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `GEMINI_API_KEY` | *(required)* | Google Gemini key (embeddings only) |
| `GROQ_API_KEY` | *(required)* | Groq key (chat generation) |
| `GROQ_MODEL` | llama-3.3-70b-versatile | Groq model for responses |
| `EMBEDDING_MODEL` | gemini-embedding-001 | Gemini embedding model |
| `EMBEDDINGS_PATH` | data/embeddings.npz | Path to embeddings file |
| `MAX_CONTEXT_CHUNKS` | 4 | Chunks retrieved per query |
| `TEMPERATURE` | 0.3 | LLM temperature (0-1) |
| `BOT_NAME` | Support Bot | Display name in widget |
| `BOT_GREETING` | Hi! Ask me anything... | Initial greeting message |
| `ALLOWED_ORIGINS` | * | CORS origins (comma-separated) |
| `ADMIN_SECRET` | changeme123 | Secret for analytics dashboard |
| `SUPABASE_URL` | *(optional)* | Supabase project URL |
| `SUPABASE_KEY` | *(optional)* | Supabase anon/public key |

## Project Structure

```
HR-Support-Bot/
├── app/
│   ├── __init__.py
│   ├── main.py            # FastAPI app, routes, SSE streaming, analytics
│   ├── rag.py             # Embedding, retrieval, Groq generation
│   ├── config.py          # Environment variable configuration
│   └── static/
│       └── widget.js      # Embeddable chat widget (vanilla JS)
├── scripts/
│   └── ingest.py          # PDF -> chunks -> embeddings -> .npz
├── data/
│   └── embeddings.npz     # Pre-computed embeddings (generated)
├── index.html             # Demo page with ConveGenius branding
├── requirements.txt
├── Dockerfile
├── render.yaml            # Render.com deployment config
├── vercel.json            # Vercel static site config
└── .env                   # Environment variables (not committed)
```

## How to Create Your Own Copy

1. **Fork this repo** on GitHub
2. **Get free API keys**: Groq + Gemini (see setup steps above)
3. **Replace the PDF**: run `python scripts/ingest.py "your-file.pdf"`
4. **Customize branding**: edit `index.html` (logo, colors, text)
5. **Update `.env`**: set your bot name, greeting, and API keys
6. **Deploy**: connect to Render (backend) + Vercel (frontend)
7. **Embed**: add the script tag to your website

Total cost: INR 0. Everything runs on free tiers.

## Rate Limits (Free Tier)

| Service | Limit | Notes |
|---------|-------|-------|
| Groq (generation) | 30 req/min, 14,400 req/day | Resets daily |
| Gemini (embeddings) | 1,500 req/day | Only used for query embedding |
| Render (hosting) | Always on with self-ping | Free tier, sleeps after 15min without keep-alive |
| Supabase (logging) | 500 MB storage, 50K rows | Free tier |

## Known Limitations

- **Single PDF only** - ingesting a new PDF replaces the old one. No multi-document support yet
- **No authentication** - anyone with the widget URL can ask questions. Add auth if deploying for sensitive documents
- **Ephemeral file storage on Render** - chat logs saved to file are lost on redeploy (use Supabase for persistence)
- **Cold starts** - Render free tier may take 30-60s on first request if the server was idle. The widget auto-retries with a "waking up" message
- **Chunk size limits** - very large PDFs (500+ pages) may produce too many chunks for effective retrieval. Consider splitting into sections
- **No image/table extraction** - only text is extracted from the PDF. Charts, images, and complex tables are skipped
- **Embedding model mismatch** - if you change the embedding model, you must re-ingest the PDF. Old embeddings won't work with a new model
- **No conversation memory across sessions** - refreshing the page clears chat history

## License

MIT

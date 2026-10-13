"""Server-only settings. Never expose GEMINI_API_KEY to the widget."""
import os
from dotenv import load_dotenv

load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
GEMINI_LIVE_MODEL = os.getenv("GEMINI_LIVE_MODEL", "gemini-3.8-live")
GEMINI_VOICE = os.getenv("GEMINI_VOICE", "Kore")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "gemini-embedding-001")
EMBEDDINGS_PATH = os.getenv("EMBEDDINGS_PATH", "data/embeddings.npz")
MAX_CONTEXT_CHUNKS = int(os.getenv("MAX_CONTEXT_CHUNKS", "4"))
TEMPERATURE = float(os.getenv("TEMPERATURE", "0.3"))
REQUEST_TIMEOUT_SECONDS = float(os.getenv("REQUEST_TIMEOUT_SECONDS", "45"))
VOICE_SESSION_SECONDS = int(os.getenv("VOICE_SESSION_SECONDS", "300"))
MAX_VOICE_SESSIONS = int(os.getenv("MAX_VOICE_SESSIONS", "8"))
VOICE_CONTEXT_MAX_CHARS = int(os.getenv("VOICE_CONTEXT_MAX_CHARS", "160000"))
BOT_NAME = os.getenv("BOT_NAME", "HR Support Bot")
BOT_GREETING = os.getenv("BOT_GREETING", "Hi! Type a question or tap the mic to talk about HR policies in Hindi, Hinglish or English.")
ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "https://cg-hr-bot.vercel.app,http://localhost:3000,http://localhost:8000").split(",") if o.strip()]

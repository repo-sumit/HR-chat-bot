import os
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL: str = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
EMBEDDING_MODEL: str = os.getenv("EMBEDDING_MODEL", "gemini-embedding-001")
EMBEDDINGS_PATH: str = os.getenv("EMBEDDINGS_PATH", "data/embeddings.npz")
MAX_CONTEXT_CHUNKS: int = int(os.getenv("MAX_CONTEXT_CHUNKS", "4"))
TEMPERATURE: float = float(os.getenv("TEMPERATURE", "0.3"))
BOT_NAME: str = os.getenv("BOT_NAME", "Support Bot")
BOT_GREETING: str = os.getenv(
    "BOT_GREETING",
    "Hi! Ask me anything. I understand Hindi, Hinglish & English.",
)
ALLOWED_ORIGINS: list[str] = [
    o.strip()
    for o in os.getenv("ALLOWED_ORIGINS", "*").split(",")
    if o.strip()
]
ADMIN_SECRET: str = os.getenv("ADMIN_SECRET", "changeme123")
SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY: str = os.getenv("SUPABASE_KEY", "")

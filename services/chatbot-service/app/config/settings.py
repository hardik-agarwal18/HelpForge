from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # ── Service ──────────────────────────────────────────────────────────────
    service_name: str = "chatbot-service"
    environment: str = "development"
    debug: bool = False

    # ── API Gateway (all LLM calls go through here) ───────────────────────
    api_gateway_url: str = "http://api-gateway:3000"
    internal_service_token: str = "change-me-in-production"

    # ── Redis ─────────────────────────────────────────────────────────────
    redis_url: str = "redis://localhost:6379"
    memory_ttl_seconds: int = 86400   # 24 h  — per-ticket conversation
    cache_ttl_seconds: int = 300      # 5 min — embedding cache

    # ── Qdrant ────────────────────────────────────────────────────────────
    qdrant_url: str = "http://localhost:6333"
    qdrant_api_key: Optional[str] = None
    vector_size: int = 1536           # OpenAI text-embedding-ada-002

    # ── RAG ───────────────────────────────────────────────────────────────
    top_k_retrieval: int = 5
    chunk_size: int = 512
    chunk_overlap: int = 64
    min_retrieval_score: float = 0.70  # Only surfaces high-confidence chunks

    # ── LLM ───────────────────────────────────────────────────────────────
    llm_timeout_seconds: float = 30.0
    llm_max_retries: int = 3
    llm_retry_delay_seconds: float = 1.0

    # ── Confidence thresholds (mirrored from API Gateway constants) ────────
    confidence_auto_resolve: float = 0.85
    confidence_suggest: float = 0.65
    confidence_escalate_max: float = 0.30

    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()

from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # ── Service ──────────────────────────────────────────────────────────────
    service_name: str = "chatbot-service"
    environment: str = "development"
    debug: bool = False

    # ── API Gateway (all LLM calls go through here) ───────────────────────
    api_gateway_url: str = "http://api-gateway:3000"

    # ── Internal API security ─────────────────────────────────────────────
    # Service registry — comma-separated "service-id:secret" pairs.
    # Each calling service gets its own identity and token; lets you revoke
    # or rotate one service without touching others.
    # Format: "chatbot-bridge-worker:secret1,admin-cli:secret2"
    # When empty, internal_service_token is used as the global fallback.
    internal_service_secrets: str = ""
    # Global fallback token (used when internal_service_secrets is not set).
    # Keep for backward-compat with dev environments.
    internal_service_token: str = "change-me-in-production"
    # IP allowlist: comma-separated CIDRs/IPs (e.g. "172.18.0.0/16,10.0.0.1").
    # Empty string disables the check (suitable for local dev).
    internal_allowed_ips: str = ""
    # HMAC signing: verifies each request was signed by the calling service.
    # Disable only in local dev/test — always True in staging/production.
    internal_hmac_enabled: bool = True
    # How many seconds a request timestamp may differ from server time.
    internal_timestamp_tolerance_seconds: int = 30

    # ── Redis ─────────────────────────────────────────────────────────────
    redis_url: str = "redis://localhost:6379"
    memory_ttl_seconds: int = 86400   # 24 h  — per-ticket conversation
    cache_ttl_seconds: int = 300      # 5 min — embedding cache

    # ── Qdrant ────────────────────────────────────────────────────────────
    qdrant_url: str = "http://localhost:6333"
    qdrant_api_key: Optional[str] = None
    vector_size: int = 1536           # OpenAI text-embedding-ada-002
    embedding_version: str = "v1"     # Bump when switching embedding models

    # ── RAG ───────────────────────────────────────────────────────────────
    top_k_retrieval: int = 5
    chunk_size: int = 512
    chunk_overlap: int = 64
    min_retrieval_score: float = 0.70  # Only surfaces high-confidence chunks

    # ── FAQ matching (embedding-only short-circuit, no LLM) ───────────────
    faq_similarity_threshold: float = 0.92  # cosine similarity required to return FAQ answer directly

    # ── Template engine (intent-based short-circuit, no embedding/LLM) ───
    template_intent_confidence_threshold: float = 0.80  # min intent confidence to apply a template

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

"""
LLM Gateway Client
──────────────────
All LLM and embedding calls go through the API Gateway — never direct to OpenAI.
This gives centralized cost tracking, org-level config enforcement, and model
switching without touching the chatbot service.

Flow:
  ChatbotService → POST /api/ai/internal/generate   → API Gateway → LLM
  ChatbotService → POST /api/ai/internal/embeddings → API Gateway → Embedding API
"""

import asyncio
import logging
from typing import AsyncGenerator, Any

import httpx

from app.config.settings import settings
from app.middleware.request_id import request_id_var

logger = logging.getLogger(__name__)

_GATEWAY_HEADERS = {
    "X-Internal-Token": settings.internal_service_token,
    "Content-Type": "application/json",
}


def _request_headers() -> dict[str, str]:
    """Per-request headers — adds X-Request-ID so traces cross service boundaries."""
    req_id = request_id_var.get("")
    return {"X-Request-ID": req_id} if req_id else {}


class GatewayClient:
    """Async HTTP client for communicating with the API Gateway."""

    def __init__(self) -> None:
        self._client: httpx.AsyncClient | None = None

    @property
    def client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=settings.api_gateway_url,
                headers=_GATEWAY_HEADERS,
                timeout=httpx.Timeout(
                    connect=5.0,
                    read=settings.llm_timeout_seconds,
                    write=10.0,
                    pool=5.0,
                ),
            )
        return self._client

    # ── Generate (standard request/response) ─────────────────────────────────

    async def generate(
        self,
        org_id: str,
        messages: list[dict[str, str]],
        system_prompt: str,
        **kwargs: Any,
    ) -> dict[str, Any]:
        """
        Call the API Gateway LLM endpoint with retry + exponential backoff.
        Returns: { content: str, usage: { promptTokens, completionTokens, cost } }
        """
        payload = {
            "orgId": org_id,
            "messages": messages,
            "systemPrompt": system_prompt,
            **kwargs,
        }

        last_error: Exception | None = None
        for attempt in range(settings.llm_max_retries):
            try:
                resp = await self.client.post(
                    "/api/ai/internal/generate",
                    json=payload,
                    headers=_request_headers(),
                )
                resp.raise_for_status()
                return resp.json()
            except httpx.TimeoutException as exc:
                last_error = exc
                logger.warning(
                    {"attempt": attempt + 1, "error": str(exc)},
                    "LLM gateway timeout, retrying",
                )
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code < 500:
                    raise  # 4xx — don't retry, re-raise immediately
                last_error = exc
                logger.warning(
                    {"attempt": attempt + 1, "status": exc.response.status_code},
                    "LLM gateway 5xx error, retrying",
                )

            await asyncio.sleep(settings.llm_retry_delay_seconds * (2**attempt))

        raise RuntimeError(f"LLM gateway failed after {settings.llm_max_retries} attempts") from last_error

    # ── Stream generate (SSE from gateway → proxied to client) ───────────────

    async def stream_generate(
        self,
        org_id: str,
        messages: list[dict[str, str]],
        system_prompt: str,
        **kwargs: Any,
    ) -> AsyncGenerator[str, None]:
        """
        Stream tokens from the API Gateway as SSE chunks.
        Each yielded value is a raw token string (data payload stripped).
        """
        payload = {
            "orgId": org_id,
            "messages": messages,
            "systemPrompt": system_prompt,
            "stream": True,
            **kwargs,
        }

        async with self.client.stream(
            "POST", "/api/ai/internal/generate/stream",
            json=payload,
            headers=_request_headers(),
        ) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if line.startswith("data: "):
                    token = line[6:]
                    if token and token != "[DONE]":
                        yield token

    # ── Embeddings ────────────────────────────────────────────────────────────

    async def get_embeddings(
        self,
        org_id: str,
        texts: list[str],
    ) -> list[list[float]]:
        """
        Batch-fetch embeddings from the API Gateway.
        Returns a list of float vectors, one per input text.
        """
        resp = await self.client.post(
            "/api/ai/internal/embeddings",
            json={"orgId": org_id, "texts": texts},
            headers=_request_headers(),
        )
        resp.raise_for_status()
        return resp.json()["embeddings"]

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            logger.info("GatewayClient HTTP connection pool closed")


# Module-level singleton — shared across all requests
gateway_client = GatewayClient()

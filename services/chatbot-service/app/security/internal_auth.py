"""
Internal API Security
──────────────────────
Four-layer defence for every /internal/* endpoint.

Layer 1 — Service identity + token  (X-Service-Id + X-Internal-Token)
  The caller declares its service name in X-Service-Id.
  The server resolves the expected secret from the service registry
  (INTERNAL_SERVICE_SECRETS) and validates the token with a constant-time
  compare.  Each service has its own revokable token — rotating one service's
  secret doesn't affect any other.
  Falls back to the global INTERNAL_SERVICE_TOKEN when the registry is empty
  (dev / simple single-service deploys).

Layer 2 — IP allowlist  (X-Forwarded-For / request.client)
  Restricts callers to known internal CIDRs (e.g. Docker bridge network).
  Configured via INTERNAL_ALLOWED_IPS="172.18.0.0/16,10.0.0.1".
  Empty value disables the check (local dev).

Layer 3 — HMAC-SHA256 request signature  (X-Timestamp + X-Signature)
  Each request is signed with the service's own secret.
  Payload: METHOD\\nPATH\\nSERVICE_ID\\nTIMESTAMP_MS\\nSHA256(body)
  Including SERVICE_ID in the payload binds the signature to the declared
  identity — a stolen token cannot be used to impersonate another service.
  Timestamp freshness (±INTERNAL_TIMESTAMP_TOLERANCE_SECONDS) limits the
  replay window to a short duration.

Layer 4 — Nonce cache  (Redis SET NX)
  The HMAC signature is stored in Redis with TTL = 2× the tolerance window.
  A duplicate signature (same request replayed within the window) is
  rejected even if the timestamp is still fresh.
  If Redis is unavailable the nonce check is skipped with a warning —
  Layers 1–3 still protect the endpoint; availability is preserved.

All failures return HTTP 403 "Forbidden" — no information about which
layer rejected the request is leaked to the caller.
"""

import hashlib
import hmac
import ipaddress
import logging
import time
from typing import Optional

import redis.asyncio as aioredis
from fastapi import Header, HTTPException, Request

from app.config.settings import settings

logger = logging.getLogger(__name__)


# ── Service registry (parsed once at first use) ───────────────────────────────

_service_registry: Optional[dict[str, str]] = None


def _get_registry() -> dict[str, str]:
    """
    Parse INTERNAL_SERVICE_SECRETS into {service_id: secret}.
    Format: "chatbot-bridge-worker:secret1,admin-cli:secret2"
    Uses partition(":") so secrets that contain colons are handled correctly.
    """
    global _service_registry
    if _service_registry is None:
        raw = settings.internal_service_secrets.strip()
        if not raw:
            _service_registry = {}
        else:
            registry: dict[str, str] = {}
            for entry in raw.split(","):
                service_id, _, secret = entry.strip().partition(":")
                if service_id and secret:
                    registry[service_id] = secret
            _service_registry = registry
            logger.info(
                "Internal auth: service registry loaded (%d services: %s)",
                len(_service_registry),
                ", ".join(_service_registry.keys()),
            )
    return _service_registry


def _resolve_secret(service_id: str) -> Optional[str]:
    """
    Return the secret for a known service, or the global fallback when the
    registry is empty (dev mode / single-service deploys).
    Returns None if the service is unknown in a non-empty registry.
    """
    registry = _get_registry()
    if registry:
        return registry.get(service_id)
    return settings.internal_service_token  # global fallback


# ── IP allowlist (parsed once at first use) ───────────────────────────────────

_allowed_networks: Optional[list] = None


def _get_allowed_networks() -> list:
    global _allowed_networks
    if _allowed_networks is None:
        raw = settings.internal_allowed_ips.strip()
        if not raw:
            _allowed_networks = []
        else:
            _allowed_networks = [
                ipaddress.ip_network(cidr.strip(), strict=False)
                for cidr in raw.split(",")
                if cidr.strip()
            ]
            logger.info(
                "Internal auth: IP allowlist loaded (%d networks)",
                len(_allowed_networks),
            )
    return _allowed_networks


# ── Redis nonce client (lazy singleton) ───────────────────────────────────────

_redis: Optional[aioredis.Redis] = None


def _get_redis() -> Optional[aioredis.Redis]:
    global _redis
    if _redis is None:
        try:
            _redis = aioredis.from_url(settings.redis_url, decode_responses=True)
        except Exception as exc:
            logger.warning("Internal auth: Redis unavailable for nonce cache: %s", exc)
    return _redis


# ── Layer helpers ──────────────────────────────────────────────────────────────

def _check_token(service_id: str, token: str) -> tuple[bool, Optional[str]]:
    """
    Resolve the secret for service_id and validate the token.
    Returns (valid, secret) so the secret can be reused for HMAC verification.
    """
    secret = _resolve_secret(service_id)
    if secret is None:
        logger.warning("Internal auth: unknown service %r", service_id)
        return False, None
    return hmac.compare_digest(token, secret), secret


def _check_ip(request: Request, service_id: str) -> bool:
    networks = _get_allowed_networks()
    if not networks:
        return True  # allowlist disabled — dev mode

    forwarded = request.headers.get("X-Forwarded-For", "")
    raw_ip = (
        forwarded.split(",")[0].strip()
        if forwarded
        else (request.client.host if request.client else "")
    )

    if not raw_ip:
        logger.warning(
            "Internal auth: IP check failed — cannot determine caller IP (service=%s)",
            service_id,
        )
        return False

    try:
        addr = ipaddress.ip_address(raw_ip)
    except ValueError:
        logger.warning(
            "Internal auth: invalid caller IP %r (service=%s)", raw_ip, service_id
        )
        return False

    allowed = any(addr in net for net in networks)
    if not allowed:
        logger.warning(
            "Internal auth: IP %s rejected — not in allowlist (service=%s)",
            raw_ip, service_id,
        )
    return allowed


async def _verify_hmac_and_nonce(
    request: Request,
    service_id: str,
    service_secret: str,
) -> bool:
    """
    Layer 3 — HMAC verification.
    Layer 4 — Nonce uniqueness via Redis SET NX.

    HMAC payload: METHOD\\nPATH\\nSERVICE_ID\\nTIMESTAMP_MS\\nSHA256(body)

    The service_id is included in the payload so a stolen token cannot be
    used to forge requests on behalf of a different service.
    """
    if not settings.internal_hmac_enabled:
        return True

    timestamp_ms = request.headers.get("X-Timestamp", "")
    signature = request.headers.get("X-Signature", "")

    if not timestamp_ms or not signature:
        logger.warning(
            "Internal auth: HMAC rejected — missing headers (service=%s)", service_id
        )
        return False

    # ── Timestamp freshness ───────────────────────────────────────────────
    try:
        age = abs(time.time() - int(timestamp_ms) / 1000.0)
        if age > settings.internal_timestamp_tolerance_seconds:
            logger.warning(
                "Internal auth: stale timestamp (age=%.1fs, service=%s)",
                age, service_id,
            )
            return False
    except (ValueError, ZeroDivisionError):
        logger.warning(
            "Internal auth: unparseable timestamp %r (service=%s)",
            timestamp_ms, service_id,
        )
        return False

    # ── HMAC recomputation ────────────────────────────────────────────────
    body = await request.body()  # Starlette-cached — endpoint Pydantic parse still works
    body_hash = hashlib.sha256(body).hexdigest()
    method = request.method.upper()
    path = request.url.path
    payload = f"{method}\n{path}\n{service_id}\n{timestamp_ms}\n{body_hash}"

    expected = hmac.new(
        service_secret.encode(),
        payload.encode(),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(expected, signature):
        logger.warning(
            "Internal auth: HMAC mismatch for %s %s (service=%s)",
            method, path, service_id,
        )
        return False

    # ── Nonce uniqueness (Redis SET NX) ───────────────────────────────────
    # TTL is 2× the tolerance window so nonces from a request at the very
    # edge of the window are still covered.
    nonce_key = f"nonce:{service_id}:{signature}"
    nonce_ttl_ms = settings.internal_timestamp_tolerance_seconds * 2 * 1000

    redis = _get_redis()
    if redis is not None:
        try:
            is_new = await redis.set(nonce_key, 1, nx=True, px=nonce_ttl_ms)
            if not is_new:
                logger.warning(
                    "Internal auth: replayed nonce rejected (service=%s, path=%s)",
                    service_id, path,
                )
                return False
        except Exception as exc:
            # Fail open: log but don't break the service on Redis outage.
            # Layers 1–3 still protect the endpoint.
            logger.warning(
                "Internal auth: nonce cache unavailable (service=%s): %s",
                service_id, exc,
            )

    return True


# ── FastAPI dependency ─────────────────────────────────────────────────────────

async def require_internal_auth(
    request: Request,
    x_service_id: str = Header(..., alias="X-Service-Id"),
    x_internal_token: str = Header(..., alias="X-Internal-Token"),
) -> None:
    """
    FastAPI dependency — enforces all four security layers in order.
    All failures return HTTP 403 "Forbidden" with no layer-specific detail.
    The authenticated service_id is available in request.state for handlers
    and middleware that need to log or audit it.
    """
    # Layer 1: service identity + token
    valid, service_secret = _check_token(x_service_id, x_internal_token)
    if not valid:
        logger.warning(
            "Internal auth: token rejected (service=%r, ip=%s)",
            x_service_id,
            request.client.host if request.client else "unknown",
        )
        raise HTTPException(status_code=403, detail="Forbidden")

    # Layer 2: IP allowlist
    if not _check_ip(request, x_service_id):
        raise HTTPException(status_code=403, detail="Forbidden")

    # Layers 3 + 4: HMAC signature + nonce cache
    if not await _verify_hmac_and_nonce(request, x_service_id, service_secret):
        raise HTTPException(status_code=403, detail="Forbidden")

    # Expose identity for handlers / audit logging
    request.state.service_id = x_service_id
    logger.debug("Internal auth: granted access (service=%s, path=%s)", x_service_id, request.url.path)

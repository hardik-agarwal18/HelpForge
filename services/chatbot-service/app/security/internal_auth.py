"""
Internal API Security
──────────────────────
Three-layer defence for every /internal/* endpoint.

Layer 1 — Shared-token check  (X-Internal-Token)
  Primary token validated via constant-time compare.
  INTERNAL_PREVIOUS_TOKEN is also accepted during a rotation window so the
  old and new tokens are both valid while services are being redeployed.

Layer 2 — IP allowlist  (request.client / X-Forwarded-For)
  Restricts callers to known internal CIDRs (e.g. the Docker bridge network).
  Configured via INTERNAL_ALLOWED_IPS="172.18.0.0/16,10.0.0.1".
  Empty value disables the check (suitable for local dev).

Layer 3 — HMAC-SHA256 request signature  (X-Timestamp + X-Signature)
  The Node.js bridge worker signs every request before sending it.
  The signature covers:  METHOD + PATH + TIMESTAMP_MS + SHA256(body)
  This prevents replay attacks and detects token theft over an unencrypted
  internal network.  Disabled when INTERNAL_HMAC_ENABLED=false (dev only).

All failures return HTTP 403 with the same "Forbidden" body to prevent
information leakage about which layer rejected the request.
"""

import hashlib
import hmac
import ipaddress
import logging
import time
from typing import Optional

from fastapi import Header, HTTPException, Request

from app.config.settings import settings

logger = logging.getLogger(__name__)


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


# ── Layer helpers ──────────────────────────────────────────────────────────────

def _check_token(token: str) -> bool:
    """Constant-time comparison against primary and (optionally) previous token."""
    if hmac.compare_digest(token, settings.internal_service_token):
        return True
    prev = settings.internal_previous_token
    return bool(prev) and hmac.compare_digest(token, prev)


def _check_ip(request: Request) -> bool:
    """Return True if the caller's IP is in the allowlist (or the list is empty)."""
    networks = _get_allowed_networks()
    if not networks:
        return True  # allowlist disabled — dev mode

    # X-Forwarded-For is set by Docker's internal proxy / nginx in front of uvicorn
    forwarded = request.headers.get("X-Forwarded-For", "")
    raw_ip = (
        forwarded.split(",")[0].strip()
        if forwarded
        else (request.client.host if request.client else "")
    )

    if not raw_ip:
        logger.warning("Internal auth: IP check — cannot determine caller IP")
        return False

    try:
        addr = ipaddress.ip_address(raw_ip)
    except ValueError:
        logger.warning("Internal auth: invalid caller IP %r", raw_ip)
        return False

    allowed = any(addr in net for net in networks)
    if not allowed:
        logger.warning(
            "Internal auth: IP %s rejected (not in allowlist)", raw_ip
        )
    return allowed


async def _verify_hmac(request: Request) -> bool:
    """
    Verify the HMAC-SHA256 request signature.

    Expected headers from the caller:
      X-Timestamp  — Unix time in milliseconds (str)
      X-Signature  — hex(HMAC-SHA256(secret, METHOD\\nPATH\\nTIMESTAMP_MS\\nSHA256(body)))

    Starlette caches request.body() after the first read, so calling it here
    does not consume the body — the endpoint's Pydantic model still parses it.
    """
    if not settings.internal_hmac_enabled:
        return True

    timestamp_ms = request.headers.get("X-Timestamp", "")
    signature = request.headers.get("X-Signature", "")

    if not timestamp_ms or not signature:
        logger.warning(
            "Internal auth: HMAC rejected — missing X-Timestamp or X-Signature"
        )
        return False

    # Freshness check — blocks replay attacks
    try:
        age = abs(time.time() - int(timestamp_ms) / 1000.0)
        if age > settings.internal_timestamp_tolerance_seconds:
            logger.warning(
                "Internal auth: HMAC rejected — stale timestamp "
                "(age=%.1fs, tolerance=%ds)",
                age,
                settings.internal_timestamp_tolerance_seconds,
            )
            return False
    except (ValueError, ZeroDivisionError):
        logger.warning("Internal auth: HMAC rejected — unparseable timestamp %r", timestamp_ms)
        return False

    # Recompute expected signature
    body = await request.body()  # Starlette-cached; endpoint Pydantic parse still works
    body_hash = hashlib.sha256(body).hexdigest()
    path = request.url.path
    method = request.method.upper()
    payload = f"{method}\n{path}\n{timestamp_ms}\n{body_hash}"

    expected = hmac.new(
        settings.internal_service_token.encode(),
        payload.encode(),
        hashlib.sha256,
    ).hexdigest()

    valid = hmac.compare_digest(expected, signature)
    if not valid:
        logger.warning(
            "Internal auth: HMAC signature mismatch for %s %s", method, path
        )
    return valid


# ── FastAPI dependency ─────────────────────────────────────────────────────────

async def require_internal_auth(
    request: Request,
    x_internal_token: str = Header(..., alias="X-Internal-Token"),
) -> None:
    """
    FastAPI dependency — enforces all three security layers in order.
    A single 403 is returned on any failure; the response body is always
    "Forbidden" to prevent leaking which check failed.
    """
    if not _check_token(x_internal_token):
        logger.warning(
            "Internal auth: token rejected (caller=%s)",
            request.client.host if request.client else "unknown",
        )
        raise HTTPException(status_code=403, detail="Forbidden")

    if not _check_ip(request):
        raise HTTPException(status_code=403, detail="Forbidden")

    if not await _verify_hmac(request):
        raise HTTPException(status_code=403, detail="Forbidden")

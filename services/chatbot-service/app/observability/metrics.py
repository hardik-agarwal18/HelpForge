"""
Observability Metrics
──────────────────────
Lightweight, zero-dependency timing and counter collector for one pipeline run.

Design goals:
  • No external service needed (Prometheus-ready but optional)
  • One instance per request — completely isolated, no shared state
  • Structured-log output → ingested by Grafana Loki / Datadog / CloudWatch

Usage:
    m = MetricsCollector()

    m.start("retrieval")
    docs = await retriever.retrieve(...)
    m.stop("retrieval")

    m.record("hit_count", len(docs))
    m.increment("cache_miss")

    m.emit(org_id=org_id, ticket_id=ticket_id)
    # → logs:  { timings_ms: {retrieval: 42.1}, counters: {cache_miss: 1}, ... }

Prometheus export (future):
    The emit() dict can be forwarded to a prometheus_client gauge/histogram
    via a shared registry without changing any call sites.
"""

import logging
import time
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class MetricsCollector:
    """Per-request metrics — create one per pipeline invocation."""

    _starts: dict[str, float] = field(default_factory=dict)
    _durations: dict[str, float] = field(default_factory=dict)
    _counters: dict[str, int] = field(default_factory=dict)
    _values: dict[str, Any] = field(default_factory=dict)

    # ── Timers ────────────────────────────────────────────────────────────

    def start(self, name: str) -> None:
        self._starts[name] = time.perf_counter()

    def stop(self, name: str) -> float:
        """Stop named timer. Returns elapsed seconds."""
        t0 = self._starts.pop(name, None)
        if t0 is None:
            return 0.0
        elapsed = time.perf_counter() - t0
        self._durations[name] = elapsed
        return elapsed

    # ── Counters ──────────────────────────────────────────────────────────

    def increment(self, name: str, by: int = 1) -> None:
        self._counters[name] = self._counters.get(name, 0) + by

    # ── Arbitrary values ──────────────────────────────────────────────────

    def record(self, name: str, value: Any) -> None:
        self._values[name] = value

    # ── Emit ──────────────────────────────────────────────────────────────

    def emit(self, **context: Any) -> dict[str, Any]:
        """
        Emit all collected metrics as a structured log record.
        Returns the full dict for callers that want to attach it to a response.
        """
        payload: dict[str, Any] = {
            **context,
            "timings_ms": {
                k: round(v * 1_000, 2) for k, v in self._durations.items()
            },
            **({f"total_ms": round(sum(self._durations.values()) * 1_000, 2)}
               if self._durations else {}),
            **self._counters,
            **self._values,
        }
        logger.info("pipeline_metrics %s", payload)
        return payload

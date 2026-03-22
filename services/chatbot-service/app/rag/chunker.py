"""
Document Chunker
─────────────────
Splits raw text into overlapping chunks that fit within the LLM's context
window while preserving sentence boundaries where possible.

Design choices:
  • Sentence-boundary detection via simple period scan (fast, no NLP dependency)
  • Overlap avoids context loss at chunk borders
  • Metadata is embedded in every chunk payload for Qdrant filtering
"""

import re
from typing import Any

from app.config.settings import settings


class DocumentChunker:
    def __init__(
        self,
        chunk_size: int | None = None,
        chunk_overlap: int | None = None,
    ) -> None:
        self.chunk_size = chunk_size or settings.chunk_size
        self.chunk_overlap = chunk_overlap or settings.chunk_overlap

    def chunk_text(
        self,
        text: str,
        metadata: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        """
        Split `text` into overlapping chunks, each enriched with `metadata`.

        Returns a list of dicts:
          { text, chunk_index, char_start, char_end, ...metadata }
        """
        metadata = metadata or {}

        # Normalize whitespace
        text = re.sub(r"\s+", " ", text).strip()

        # Short enough to be a single chunk
        if len(text) <= self.chunk_size:
            return [{"text": text, "chunk_index": 0, "char_start": 0, "char_end": len(text), **metadata}]

        chunks: list[dict[str, Any]] = []
        start = 0
        chunk_index = 0

        while start < len(text):
            end = min(start + self.chunk_size, len(text))

            # Prefer a sentence boundary within the latter half of the window
            if end < len(text):
                boundary = text.rfind(".", start + self.chunk_size // 2, end)
                if boundary != -1:
                    end = boundary + 1  # include the period

            chunk_text = text[start:end].strip()
            if chunk_text:
                chunks.append(
                    {
                        "text": chunk_text,
                        "chunk_index": chunk_index,
                        "char_start": start,
                        "char_end": end,
                        **metadata,
                    }
                )
                chunk_index += 1

            # Next window starts before the end to create overlap
            start = end - self.chunk_overlap
            if start >= len(text):
                break

        return chunks


chunker = DocumentChunker()

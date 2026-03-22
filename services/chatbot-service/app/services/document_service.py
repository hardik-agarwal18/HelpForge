"""
Document Service
─────────────────
Called exclusively by the Node.js chatbot bridge worker via internal HTTP.

Pipeline:  raw text → chunk → embed → upsert into Qdrant (org-isolated)
Re-indexing: existing vectors for the same document_id are deleted first.
"""

import logging

from app.config.settings import settings
from app.embeddings.embedder import embedder
from app.models.schemas import (
    EmbedRequest,
    EmbedResponse,
    ProcessDocumentRequest,
    ProcessDocumentResponse,
)
from app.rag.chunker import chunker
from app.vectorstore.qdrant_store import vector_store

logger = logging.getLogger(__name__)


class DocumentService:
    async def process_document(
        self, request: ProcessDocumentRequest
    ) -> ProcessDocumentResponse:
        """
        Full RAG ingestion pipeline for one document:
          1. Chunk text (with sentence-boundary awareness)
          2. Delete stale vectors for this document_id
          3. Embed all chunks in one batched API call
          4. Upsert into the org's Qdrant collection
        """
        base_metadata = {
            "document_id": request.document_id,
            "org_id": request.org_id,
            "source": request.metadata.get("filename", request.document_id),
            "embedding_version": settings.embedding_version,
            **request.metadata,
        }

        # 1. Chunk
        if request.chunk:
            chunks = chunker.chunk_text(request.content, base_metadata)
        else:
            chunks = [{"text": request.content, "chunk_index": 0, **base_metadata}]

        # 2. Delete stale vectors (idempotent re-index)
        await vector_store.delete_by_document(request.org_id, request.document_id)

        # 3. Embed
        texts = [c["text"] for c in chunks]
        vectors = await embedder.embed_many(request.org_id, texts)

        # 4. Upsert
        await vector_store.upsert(
            org_id=request.org_id,
            vectors=vectors,
            payloads=chunks,
        )

        logger.info(
            "Document ingested: org=%s, doc=%s, chunks=%d",
            request.org_id,
            request.document_id,
            len(chunks),
        )

        return ProcessDocumentResponse(
            document_id=request.document_id,
            chunks_created=len(chunks),
            status="success",
        )

    async def embed_texts(self, request: EmbedRequest) -> EmbedResponse:
        """
        Embed arbitrary texts and insert them into the org's vector store.
        Useful for embedding ticket comments, KB articles, etc.
        """
        vectors = await embedder.embed_many(request.org_id, request.texts)

        payloads = (
            request.metadata
            if request.metadata and len(request.metadata) == len(request.texts)
            else [{} for _ in request.texts]
        )

        await vector_store.upsert(
            org_id=request.org_id,
            vectors=vectors,
            payloads=payloads,
        )

        return EmbedResponse(embedded=len(vectors), status="success")


document_service = DocumentService()

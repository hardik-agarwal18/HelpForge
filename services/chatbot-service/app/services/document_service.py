"""
Document Service
─────────────────
Called exclusively by the Node.js chatbot bridge worker via internal HTTP.

Pipeline:  raw text → chunk → embed → upsert into Qdrant (org-isolated)
Re-indexing: existing vectors for the same document_id are deleted first.

Scraped-page support (added):
  delete_scraped_documents — batch-delete vectors by document_id list (cleanup cron)
"""

import logging
from typing import List

from app.config.settings import settings
from app.embeddings.embedder import embedder
from app.models.schemas import (
    DeleteScrapedDocumentsRequest,
    DeleteScrapedDocumentsResponse,
    EmbedRequest,
    EmbedResponse,
    ProcessDocumentRequest,
    ProcessDocumentResponse,
    UpsertFAQRequest,
    UpsertFAQResponse,
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

    async def upsert_faqs(self, request: UpsertFAQRequest) -> UpsertFAQResponse:
        """
        Index a list of FAQ entries into Qdrant so the FAQMatcher can find them.

        Each entry embeds the *question* (for similarity search) and stores the
        *answer* in the payload (returned verbatim on match).  The faq_id is used
        as the Qdrant point ID so re-upserts are idempotent.

        Payload shape:
          source_type      = "faq"
          document_id      = entry.faq_id
          question         = entry.question
          answer           = entry.answer
          text             = entry.question   ← used by keyword search + text index
          org_id           = request.org_id
          embedding_version = settings.embedding_version
        """
        if not request.faqs:
            return UpsertFAQResponse(org_id=request.org_id, upserted=0, status="success")

        questions = [e.question for e in request.faqs]
        vectors = await embedder.embed_many(request.org_id, questions)

        payloads = [
            {
                "source_type": "faq",
                "document_id": entry.faq_id,
                "question": entry.question,
                "answer": entry.answer,
                "text": entry.question,       # full-text index key
                "org_id": request.org_id,
                "embedding_version": settings.embedding_version,
            }
            for entry in request.faqs
        ]
        ids = [entry.faq_id for entry in request.faqs]

        await vector_store.upsert(
            org_id=request.org_id,
            vectors=vectors,
            payloads=payloads,
            ids=ids,
        )

        logger.info(
            "FAQ entries upserted: org=%s, count=%d",
            request.org_id,
            len(request.faqs),
        )
        return UpsertFAQResponse(
            org_id=request.org_id,
            upserted=len(request.faqs),
            status="success",
        )

    async def delete_scraped_documents(
        self, request: DeleteScrapedDocumentsRequest
    ) -> DeleteScrapedDocumentsResponse:
        """
        Batch-delete Qdrant vectors for expired scraped-page documents.

        Called by the scraper cleanup cron via the chatbot bridge worker
        (`delete-documents` job → `POST /internal/scraper/delete-documents`).

        Uses `document_id` values (urlHash strings) to locate and delete
        all chunks belonging to each page.  Safe to call multiple times
        (idempotent — deleting non-existent points is a no-op in Qdrant).
        """
        deleted = await vector_store.delete_by_documents(
            request.org_id, request.document_ids
        )

        logger.info(
            "Scraped-page vectors deleted: org=%s, documents=%d",
            request.org_id,
            deleted,
        )

        return DeleteScrapedDocumentsResponse(
            org_id=request.org_id,
            documents_deleted=deleted,
            status="success",
        )


document_service = DocumentService()

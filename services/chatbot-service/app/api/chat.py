import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.models.schemas import ChatRequest, ChatResponse
from app.services.chat_service import chat_service

router = APIRouter(prefix="/chat", tags=["chat"])
logger = logging.getLogger(__name__)


@router.post("", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    """
    Single-turn RAG chat.
    Returns a complete response with confidence score + action recommendation.
    """
    try:
        return await chat_service.handle_message(request)
    except Exception as exc:
        logger.error("Chat error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Chat processing failed")


@router.post("/stream")
async def chat_stream(request: ChatRequest) -> StreamingResponse:
    """
    SSE streaming chat.
    Response format: `data: <token>\\n\\n` ... `data: [DONE]\\n\\n`

    Client-side:
        const es = new EventSource('/chat/stream');
        es.onmessage = (e) => { if (e.data === '[DONE]') es.close(); }
    """
    async def event_generator():
        try:
            async for chunk in chat_service.stream_message(request):
                yield chunk
        except Exception as exc:
            logger.error("Stream error: %s", exc, exc_info=True)
            yield "data: [ERROR]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # disable nginx read buffering
            "Connection": "keep-alive",
        },
    )

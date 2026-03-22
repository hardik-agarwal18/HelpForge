import logging

from fastapi import APIRouter, HTTPException

from app.models.schemas import FeedbackRequest, FeedbackResponse
from app.services.feedback_service import feedback_service

router = APIRouter(prefix="/feedback", tags=["feedback"])
logger = logging.getLogger(__name__)


@router.post("", response_model=FeedbackResponse)
async def submit_feedback(request: FeedbackRequest) -> FeedbackResponse:
    """
    Store per-message user feedback (rating + helpful flag).
    Used to improve future prompts and surface poorly-performing answers.
    """
    try:
        feedback_id = await feedback_service.store_feedback(request)
        return FeedbackResponse(success=True, feedback_id=feedback_id)
    except Exception as exc:
        logger.error("Feedback error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to store feedback")

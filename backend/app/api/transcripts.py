import uuid
from fastapi import APIRouter, HTTPException, Header
from typing import Optional

from app.models.transcript import TranscriptCreate, TranscriptResponse, TranscriptListResponse
from app.services.transcript_storage import get_transcript_storage

router = APIRouter(prefix="/transcripts", tags=["transcripts"])


def get_user_id_from_header(x_user_id: Optional[str] = Header(None)) -> str:
    """Extract user ID from header (set by frontend from Clerk)."""
    if not x_user_id:
        raise HTTPException(status_code=401, detail="User ID required")
    return x_user_id


@router.get("/status")
async def get_transcripts_status():
    """Check if transcript history is available."""
    storage = get_transcript_storage()
    return {
        "available": storage.is_available(),
        "message": "Transcript history enabled"
    }


@router.post("", response_model=TranscriptResponse)
async def create_transcript(
    transcript: TranscriptCreate,
    x_user_id: Optional[str] = Header(None)
):
    """Save a transcript to history."""
    user_id = get_user_id_from_header(x_user_id)
    storage = get_transcript_storage()

    data = {
        "user_id": user_id,
        "file_name": transcript.file_name,
        "file_size_bytes": transcript.file_size_bytes,
        "audio_duration_seconds": transcript.audio_duration_seconds,
        "text": transcript.text,
        "language": transcript.language,
        "confidence": transcript.confidence,
        "provider": transcript.provider,
        "cost_metrics": transcript.cost_metrics.model_dump() if transcript.cost_metrics else None,
    }

    try:
        row = storage.create(data)
        return TranscriptResponse(
            id=row["id"],
            user_id=row["user_id"],
            file_name=row["file_name"],
            file_size_bytes=row.get("file_size_bytes"),
            audio_duration_seconds=row.get("audio_duration_seconds"),
            text=row["text"],
            language=row.get("language"),
            confidence=row.get("confidence"),
            provider=row.get("provider"),
            cost_metrics=row.get("cost_metrics"),
            created_at=row.get("created_at"),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save transcript: {str(e)}")


@router.get("", response_model=TranscriptListResponse)
async def list_transcripts(
    page: int = 1,
    page_size: int = 20,
    x_user_id: Optional[str] = Header(None)
):
    """List user's transcripts with pagination."""
    user_id = get_user_id_from_header(x_user_id)
    storage = get_transcript_storage()

    try:
        transcripts_data, total = storage.list(user_id, page, page_size)

        transcripts = [
            TranscriptResponse(
                id=row["id"],
                user_id=row["user_id"],
                file_name=row["file_name"],
                file_size_bytes=row.get("file_size_bytes"),
                audio_duration_seconds=row.get("audio_duration_seconds"),
                text=row["text"],
                language=row.get("language"),
                confidence=row.get("confidence"),
                provider=row.get("provider"),
                cost_metrics=row.get("cost_metrics"),
                created_at=row.get("created_at"),
            )
            for row in transcripts_data
        ]

        return TranscriptListResponse(
            transcripts=transcripts,
            total=total,
            page=page,
            page_size=page_size,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.get("/{transcript_id}", response_model=TranscriptResponse)
async def get_transcript(
    transcript_id: str,
    x_user_id: Optional[str] = Header(None)
):
    """Get a specific transcript by ID."""
    user_id = get_user_id_from_header(x_user_id)
    storage = get_transcript_storage()

    try:
        row = storage.get(transcript_id, user_id)

        if not row:
            raise HTTPException(status_code=404, detail="Transcript not found")

        return TranscriptResponse(
            id=row["id"],
            user_id=row["user_id"],
            file_name=row["file_name"],
            file_size_bytes=row.get("file_size_bytes"),
            audio_duration_seconds=row.get("audio_duration_seconds"),
            text=row["text"],
            language=row.get("language"),
            confidence=row.get("confidence"),
            provider=row.get("provider"),
            cost_metrics=row.get("cost_metrics"),
            created_at=row.get("created_at"),
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.delete("/{transcript_id}")
async def delete_transcript(
    transcript_id: str,
    x_user_id: Optional[str] = Header(None)
):
    """Delete a transcript."""
    user_id = get_user_id_from_header(x_user_id)
    storage = get_transcript_storage()

    try:
        deleted = storage.delete(transcript_id, user_id)

        if not deleted:
            raise HTTPException(status_code=404, detail="Transcript not found")

        return {"message": "Transcript deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

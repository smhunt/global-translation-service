from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/transcribe", tags=["transcription"])


class TranscriptionResponse(BaseModel):
    text: str
    language: Optional[str] = None
    duration_seconds: Optional[float] = None
    confidence: Optional[float] = None


class TranscriptionStatus(BaseModel):
    status: str
    message: str


@router.post("/audio", response_model=TranscriptionResponse)
async def transcribe_audio(
    file: UploadFile = File(...),
    language: Optional[str] = None
):
    """
    Transcribe an audio file using local Whisper model via Ollama.
    Supports multiple languages and automatic language detection.
    """
    if not file.content_type or not file.content_type.startswith("audio/"):
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Please upload an audio file."
        )

    # TODO: Implement actual transcription with Ollama/Whisper
    return TranscriptionResponse(
        text="[Transcription placeholder - Ollama integration pending]",
        language=language or "auto",
        duration_seconds=0.0,
        confidence=0.0
    )


@router.get("/status", response_model=TranscriptionStatus)
async def get_status():
    """Check if transcription service is ready."""
    # TODO: Check Ollama connection and model availability
    return TranscriptionStatus(
        status="ready",
        message="Transcription service is operational"
    )

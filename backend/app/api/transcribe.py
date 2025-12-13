import uuid
import asyncio
import json
from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional

from app.services.whisper import whisper_service

router = APIRouter(prefix="/transcribe", tags=["transcription"])


class TranscriptionResponse(BaseModel):
    text: str
    language: Optional[str] = None
    duration_seconds: Optional[float] = None
    confidence: Optional[float] = None


class TranscriptionStatus(BaseModel):
    status: str
    model: Optional[str] = None
    device: Optional[str] = None
    message: str


class JobCreatedResponse(BaseModel):
    job_id: str
    message: str


class ProgressResponse(BaseModel):
    job_id: str
    status: str
    progress: float
    current_segment: int
    total_segments: int
    elapsed_seconds: float
    estimated_remaining: float
    current_text: str
    message: str


@router.post("/audio", response_model=TranscriptionResponse)
async def transcribe_audio(
    file: UploadFile = File(...),
    language: Optional[str] = None
):
    """
    Transcribe an audio file using local Whisper model.
    Supports multiple languages and automatic language detection.

    - **file**: Audio file (MP3, WAV, M4A, OGG, FLAC, etc.)
    - **language**: Optional language code (e.g., 'en', 'es'). Auto-detects if not provided.
    """
    # Validate file type
    valid_types = [
        "audio/mpeg", "audio/mp3", "audio/wav", "audio/wave", "audio/x-wav",
        "audio/mp4", "audio/m4a", "audio/x-m4a", "audio/ogg", "audio/flac",
        "audio/webm", "video/webm"  # webm can contain audio
    ]

    content_type = file.content_type or ""
    if not content_type.startswith("audio/") and content_type not in valid_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type: {content_type}. Please upload an audio file."
        )

    try:
        # Read file content
        audio_data = await file.read()

        if len(audio_data) == 0:
            raise HTTPException(status_code=400, detail="Empty file uploaded")

        # Transcribe using Whisper
        result = await whisper_service.transcribe(
            audio_data=audio_data,
            filename=file.filename or "audio.wav",
            language=language,
        )

        return TranscriptionResponse(
            text=result.text,
            language=result.language,
            duration_seconds=result.duration,
            confidence=result.confidence,
        )

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Transcription failed: {str(e)}"
        )


# Store for pending audio data (job_id -> audio_data)
_pending_audio: dict = {}


@router.post("/start", response_model=JobCreatedResponse)
async def start_transcription(
    file: UploadFile = File(...),
    language: Optional[str] = None,
    background_tasks: BackgroundTasks = None,
):
    """
    Start an async transcription job and return a job ID.
    Use /progress/{job_id} SSE endpoint to monitor progress.
    """
    # Validate file type
    valid_types = [
        "audio/mpeg", "audio/mp3", "audio/wav", "audio/wave", "audio/x-wav",
        "audio/mp4", "audio/m4a", "audio/x-m4a", "audio/ogg", "audio/flac",
        "audio/webm", "video/webm"
    ]

    content_type = file.content_type or ""
    if not content_type.startswith("audio/") and content_type not in valid_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type: {content_type}. Please upload an audio file."
        )

    # Read file content
    audio_data = await file.read()

    if len(audio_data) == 0:
        raise HTTPException(status_code=400, detail="Empty file uploaded")

    # Create job
    job_id = str(uuid.uuid4())
    job = whisper_service.create_job(job_id)
    job.status = "uploading"

    # Store audio data and metadata for processing
    _pending_audio[job_id] = {
        "audio_data": audio_data,
        "filename": file.filename or "audio.wav",
        "language": language,
    }

    return JobCreatedResponse(
        job_id=job_id,
        message="Job created. Connect to /progress/{job_id} for updates."
    )


async def run_transcription(job_id: str):
    """Background task to run transcription."""
    pending = _pending_audio.get(job_id)
    if not pending:
        return

    try:
        await whisper_service.transcribe_with_progress(
            job_id=job_id,
            audio_data=pending["audio_data"],
            filename=pending["filename"],
            language=pending["language"],
        )
    except Exception as e:
        job = whisper_service.get_job(job_id)
        if job:
            job.status = "error"
            job.error = str(e)
    finally:
        # Clean up pending audio data
        _pending_audio.pop(job_id, None)


@router.get("/progress/{job_id}")
async def stream_progress(job_id: str):
    """
    Server-Sent Events (SSE) endpoint for real-time transcription progress.
    Connect to this endpoint after calling /start to receive progress updates.
    """
    job = whisper_service.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    async def event_generator():
        # Start transcription if not already running
        if job.status in ["pending", "uploading"]:
            asyncio.create_task(run_transcription(job_id))

        while True:
            progress = whisper_service.get_progress(job_id)
            if not progress:
                yield f"data: {json.dumps({'error': 'Job not found'})}\n\n"
                break

            data = {
                "job_id": progress.job_id,
                "status": progress.status,
                "progress": round(progress.progress, 1),
                "current_segment": progress.current_segment,
                "total_segments": progress.total_segments,
                "elapsed_seconds": round(progress.elapsed_seconds, 1),
                "estimated_remaining": round(progress.estimated_remaining, 1),
                "current_text": progress.current_text,
                "message": progress.message,
            }

            # If complete, include full result
            if progress.status == "complete":
                job = whisper_service.get_job(job_id)
                if job and job.result:
                    data["result"] = {
                        "text": job.result.text,
                        "language": job.result.language,
                        "duration_seconds": job.result.duration,
                        "confidence": job.result.confidence,
                    }
                yield f"data: {json.dumps(data)}\n\n"
                break

            # If error, send error and stop
            if progress.status == "error":
                yield f"data: {json.dumps(data)}\n\n"
                break

            yield f"data: {json.dumps(data)}\n\n"
            await asyncio.sleep(0.5)  # Update every 500ms

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
        }
    )


@router.get("/job/{job_id}", response_model=ProgressResponse)
async def get_job_progress(job_id: str):
    """Get current progress for a transcription job (non-streaming)."""
    progress = whisper_service.get_progress(job_id)
    if not progress:
        raise HTTPException(status_code=404, detail="Job not found")

    return ProgressResponse(
        job_id=progress.job_id,
        status=progress.status,
        progress=progress.progress,
        current_segment=progress.current_segment,
        total_segments=progress.total_segments,
        elapsed_seconds=progress.elapsed_seconds,
        estimated_remaining=progress.estimated_remaining,
        current_text=progress.current_text,
        message=progress.message,
    )


@router.get("/status", response_model=TranscriptionStatus)
async def get_status():
    """Check if transcription service is ready and get model info."""
    status = whisper_service.get_status()
    return TranscriptionStatus(**status)

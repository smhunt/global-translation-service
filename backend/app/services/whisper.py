import os
import tempfile
import asyncio
import time
from typing import Optional, Callable, AsyncGenerator
from dataclasses import dataclass, field
from faster_whisper import WhisperModel

from app.core.config import get_settings


@dataclass
class TranscriptionResult:
    text: str
    language: str
    duration: float
    confidence: float


@dataclass
class TranscriptionProgress:
    job_id: str
    status: str  # "uploading", "processing", "transcribing", "complete", "error"
    progress: float  # 0-100
    current_segment: int = 0
    total_segments: int = 0
    elapsed_seconds: float = 0
    estimated_remaining: float = 0
    current_text: str = ""
    message: str = ""


@dataclass
class TranscriptionJob:
    job_id: str
    status: str = "pending"
    progress: float = 0
    current_segment: int = 0
    total_segments: int = 0
    start_time: float = 0
    audio_duration: float = 0
    current_text: str = ""
    result: Optional[TranscriptionResult] = None
    error: Optional[str] = None


class WhisperService:
    """Service for audio transcription using faster-whisper."""

    _instance: Optional["WhisperService"] = None
    _model: Optional[WhisperModel] = None
    _jobs: dict = field(default_factory=dict)

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._jobs = {}
        return cls._instance

    def _get_model(self) -> WhisperModel:
        """Lazy load the Whisper model."""
        if self._model is None:
            settings = get_settings()
            self._model = WhisperModel(
                settings.whisper_model,
                device=settings.whisper_device,
                compute_type=settings.whisper_compute_type,
            )
        return self._model

    def create_job(self, job_id: str) -> TranscriptionJob:
        """Create a new transcription job."""
        job = TranscriptionJob(job_id=job_id)
        self._jobs[job_id] = job
        return job

    def get_job(self, job_id: str) -> Optional[TranscriptionJob]:
        """Get a transcription job by ID."""
        return self._jobs.get(job_id)

    def get_progress(self, job_id: str) -> Optional[TranscriptionProgress]:
        """Get progress for a job."""
        job = self._jobs.get(job_id)
        if not job:
            return None

        elapsed = time.time() - job.start_time if job.start_time > 0 else 0

        # Estimate remaining time based on audio duration and progress
        estimated_remaining = 0
        if job.progress > 0 and job.audio_duration > 0:
            # Assume roughly 2-4x real-time for base model on CPU
            total_estimated = job.audio_duration * 3  # Conservative estimate
            estimated_remaining = max(0, total_estimated - elapsed)

        return TranscriptionProgress(
            job_id=job_id,
            status=job.status,
            progress=job.progress,
            current_segment=job.current_segment,
            total_segments=job.total_segments,
            elapsed_seconds=elapsed,
            estimated_remaining=estimated_remaining,
            current_text=job.current_text[-200:] if job.current_text else "",  # Last 200 chars
            message=self._get_status_message(job),
        )

    def _get_status_message(self, job: TranscriptionJob) -> str:
        """Generate human-readable status message."""
        if job.status == "pending":
            return "Waiting to start..."
        elif job.status == "uploading":
            return "Receiving audio file..."
        elif job.status == "processing":
            return "Preparing audio for transcription..."
        elif job.status == "loading_model":
            return "Loading Whisper model..."
        elif job.status == "transcribing":
            if job.total_segments > 0:
                return f"Transcribing segment {job.current_segment}/{job.total_segments}..."
            return "Transcribing audio..."
        elif job.status == "complete":
            return "Transcription complete!"
        elif job.status == "error":
            return f"Error: {job.error}"
        return job.status

    async def transcribe_with_progress(
        self,
        job_id: str,
        audio_data: bytes,
        filename: str,
        language: Optional[str] = None,
    ) -> TranscriptionResult:
        """
        Transcribe audio data to text with progress tracking.
        """
        job = self._jobs.get(job_id)
        if not job:
            job = self.create_job(job_id)

        job.start_time = time.time()
        job.status = "processing"
        job.progress = 5

        # Get file extension
        ext = os.path.splitext(filename)[1] or ".wav"

        # Write to temp file (faster-whisper needs a file path)
        with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
            tmp.write(audio_data)
            tmp_path = tmp.name

        try:
            job.status = "loading_model"
            job.progress = 10
            await asyncio.sleep(0.1)  # Allow progress update to be sent

            model = self._get_model()

            job.status = "transcribing"
            job.progress = 15

            # Transcribe - get segments iterator and info
            segments_iter, info = model.transcribe(
                tmp_path,
                language=language,
                beam_size=5,
                vad_filter=True,
                vad_parameters=dict(
                    min_silence_duration_ms=500,
                ),
            )

            job.audio_duration = info.duration

            # Estimate total segments based on duration (rough: 1 segment per 5-10 seconds)
            estimated_segments = max(1, int(info.duration / 7))
            job.total_segments = estimated_segments

            # Collect all segments with progress updates
            text_parts = []
            total_confidence = 0.0
            segment_count = 0

            for segment in segments_iter:
                segment_count += 1
                job.current_segment = segment_count

                # Update estimated total if we're exceeding
                if segment_count > job.total_segments:
                    job.total_segments = segment_count + max(1, int((info.duration - segment.end) / 7))

                text_parts.append(segment.text.strip())
                job.current_text = " ".join(text_parts)
                total_confidence += segment.avg_logprob

                # Update progress (15-95% range for transcription)
                progress_pct = (segment.end / info.duration) * 80 if info.duration > 0 else 0
                job.progress = min(95, 15 + progress_pct)

                # Yield control to allow progress updates
                await asyncio.sleep(0.01)

            job.total_segments = segment_count

            # Calculate average confidence
            avg_confidence = 0.0
            if segment_count > 0:
                avg_logprob = total_confidence / segment_count
                avg_confidence = min(1.0, max(0.0, 1.0 + avg_logprob))

            result = TranscriptionResult(
                text=" ".join(text_parts),
                language=info.language,
                duration=info.duration,
                confidence=round(avg_confidence, 3),
            )

            job.status = "complete"
            job.progress = 100
            job.result = result

            return result

        except Exception as e:
            job.status = "error"
            job.error = str(e)
            raise

        finally:
            # Clean up temp file
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)

    async def transcribe(
        self,
        audio_data: bytes,
        filename: str,
        language: Optional[str] = None,
    ) -> TranscriptionResult:
        """
        Transcribe audio data to text (legacy method without progress).
        """
        import uuid
        job_id = str(uuid.uuid4())
        return await self.transcribe_with_progress(job_id, audio_data, filename, language)

    def get_status(self) -> dict:
        """Check if the service is ready and return model info."""
        try:
            model = self._get_model()
            settings = get_settings()
            return {
                "status": "ready",
                "model": settings.whisper_model,
                "device": settings.whisper_device,
                "message": "Whisper model loaded and ready",
            }
        except Exception as e:
            return {
                "status": "error",
                "model": None,
                "device": None,
                "message": f"Failed to load model: {str(e)}",
            }


# Global service instance
whisper_service = WhisperService()

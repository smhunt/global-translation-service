import os
import tempfile
import asyncio
import time
import httpx
from typing import Optional, Literal
from dataclasses import dataclass
from faster_whisper import WhisperModel

from app.core.config import get_settings

# Pricing constants (per minute)
OPENAI_WHISPER_PRICE_PER_MINUTE = 0.006  # $0.006/min for OpenAI Whisper API
LOCAL_COMPUTE_COST_PER_MINUTE = 0.001    # Estimated local compute cost (electricity, etc.)

# Provider type
Provider = Literal["local", "cloud", "both"]


@dataclass
class CostMetrics:
    """Cost and resource metrics for a transcription job."""
    audio_duration_seconds: float = 0
    audio_duration_minutes: float = 0
    file_size_bytes: int = 0
    file_size_mb: float = 0
    processing_time_seconds: float = 0
    processing_speed_ratio: float = 0  # audio_duration / processing_time (>1 = faster than real-time)

    # Cost calculations
    cloud_api_cost: float = 0          # What this would cost on OpenAI Whisper API
    local_compute_cost: float = 0       # Estimated local cost
    savings: float = 0                  # cloud_api_cost - local_compute_cost
    savings_percentage: float = 0       # Percentage saved vs cloud


@dataclass
class ProviderResult:
    """Result from a single provider."""
    provider: str  # "local" or "cloud"
    text: str
    language: str
    duration: float
    confidence: float
    processing_time_seconds: float
    cost: float


@dataclass
class TranscriptionResult:
    text: str
    language: str
    duration: float
    confidence: float
    cost_metrics: Optional[CostMetrics] = None
    provider: str = "local"
    # For comparison mode
    local_result: Optional[ProviderResult] = None
    cloud_result: Optional[ProviderResult] = None


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
    # Cost estimates (shown during processing)
    estimated_cloud_cost: float = 0
    audio_duration_seconds: float = 0
    file_size_mb: float = 0
    provider: str = "local"


@dataclass
class TranscriptionJob:
    job_id: str
    status: str = "pending"
    progress: float = 0
    current_segment: int = 0
    total_segments: int = 0
    start_time: float = 0
    audio_duration: float = 0
    file_size_bytes: int = 0
    current_text: str = ""
    result: Optional[TranscriptionResult] = None
    error: Optional[str] = None
    provider: str = "local"


class WhisperService:
    """Service for audio transcription using faster-whisper."""

    _instance: Optional["WhisperService"] = None
    _model: Optional[WhisperModel] = None

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

    def create_job(self, job_id: str, file_size_bytes: int = 0, provider: str = "local") -> TranscriptionJob:
        """Create a new transcription job."""
        job = TranscriptionJob(job_id=job_id, file_size_bytes=file_size_bytes, provider=provider)
        self._jobs[job_id] = job
        return job

    def get_job(self, job_id: str) -> Optional[TranscriptionJob]:
        """Get a transcription job by ID."""
        return self._jobs.get(job_id)

    def _calculate_costs(self, audio_duration: float, processing_time: float, file_size_bytes: int, provider: str = "local") -> CostMetrics:
        """Calculate cost metrics for a transcription job."""
        audio_minutes = audio_duration / 60

        cloud_cost = audio_minutes * OPENAI_WHISPER_PRICE_PER_MINUTE
        local_cost = audio_minutes * LOCAL_COMPUTE_COST_PER_MINUTE

        if provider == "cloud":
            actual_cost = cloud_cost
            savings = 0
            savings_pct = 0
        else:
            actual_cost = local_cost
            savings = cloud_cost - local_cost
            savings_pct = (savings / cloud_cost * 100) if cloud_cost > 0 else 0

        speed_ratio = audio_duration / processing_time if processing_time > 0 else 0

        return CostMetrics(
            audio_duration_seconds=round(audio_duration, 2),
            audio_duration_minutes=round(audio_minutes, 2),
            file_size_bytes=file_size_bytes,
            file_size_mb=round(file_size_bytes / (1024 * 1024), 2),
            processing_time_seconds=round(processing_time, 2),
            processing_speed_ratio=round(speed_ratio, 2),
            cloud_api_cost=round(cloud_cost, 4),
            local_compute_cost=round(local_cost, 4),
            savings=round(savings, 4),
            savings_percentage=round(savings_pct, 1),
        )

    def get_progress(self, job_id: str) -> Optional[TranscriptionProgress]:
        """Get progress for a job."""
        job = self._jobs.get(job_id)
        if not job:
            return None

        elapsed = time.time() - job.start_time if job.start_time > 0 else 0

        # Estimate remaining time based on actual progress rate
        estimated_remaining = 0
        if job.progress > 15 and elapsed > 0:  # Only estimate after transcription starts (15%)
            # Calculate based on actual processing speed
            progress_since_start = job.progress - 15  # Transcription progress (15-100%)
            if progress_since_start > 0:
                # Time per percentage point
                time_per_percent = elapsed / progress_since_start
                remaining_percent = 100 - job.progress
                estimated_remaining = max(0, time_per_percent * remaining_percent)

        # Calculate estimated cloud cost
        audio_minutes = job.audio_duration / 60 if job.audio_duration > 0 else 0
        estimated_cloud_cost = audio_minutes * OPENAI_WHISPER_PRICE_PER_MINUTE

        return TranscriptionProgress(
            job_id=job_id,
            status=job.status,
            progress=job.progress,
            current_segment=job.current_segment,
            total_segments=job.total_segments,
            elapsed_seconds=elapsed,
            estimated_remaining=estimated_remaining,
            current_text=job.current_text[-200:] if job.current_text else "",
            message=self._get_status_message(job),
            estimated_cloud_cost=round(estimated_cloud_cost, 4),
            audio_duration_seconds=round(job.audio_duration, 2),
            file_size_mb=round(job.file_size_bytes / (1024 * 1024), 2) if job.file_size_bytes > 0 else 0,
            provider=job.provider,
        )

    def _get_status_message(self, job: TranscriptionJob) -> str:
        """Generate human-readable status message."""
        provider_label = f"[{job.provider.upper()}] " if job.provider != "local" else ""

        if job.status == "pending":
            return f"{provider_label}Waiting to start..."
        elif job.status == "uploading":
            return f"{provider_label}Receiving audio file..."
        elif job.status == "processing":
            return f"{provider_label}Preparing audio for transcription..."
        elif job.status == "loading_model":
            return f"{provider_label}Loading Whisper model..."
        elif job.status == "transcribing":
            if job.total_segments > 0:
                return f"{provider_label}Transcribing segment {job.current_segment}/{job.total_segments}..."
            return f"{provider_label}Transcribing audio..."
        elif job.status == "transcribing_cloud":
            return f"[CLOUD] Sending to OpenAI Whisper API..."
        elif job.status == "complete":
            return f"{provider_label}Transcription complete!"
        elif job.status == "error":
            return f"{provider_label}Error: {job.error}"
        return job.status

    async def transcribe_cloud(
        self,
        audio_data: bytes,
        filename: str,
        language: Optional[str] = None,
    ) -> ProviderResult:
        """Transcribe using OpenAI Whisper API."""
        settings = get_settings()

        if not settings.openai_api_key:
            raise ValueError("OpenAI API key not configured. Set OPENAI_API_KEY in .env")

        start_time = time.time()

        # Get file extension
        ext = os.path.splitext(filename)[1] or ".wav"

        # Write to temp file for upload
        with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
            tmp.write(audio_data)
            tmp_path = tmp.name

        try:
            async with httpx.AsyncClient(timeout=300.0) as client:
                with open(tmp_path, "rb") as audio_file:
                    files = {"file": (filename, audio_file, "audio/mpeg")}
                    data = {"model": "whisper-1"}
                    if language:
                        data["language"] = language

                    response = await client.post(
                        "https://api.openai.com/v1/audio/transcriptions",
                        headers={"Authorization": f"Bearer {settings.openai_api_key}"},
                        files=files,
                        data=data,
                    )

                    if response.status_code != 200:
                        raise Exception(f"OpenAI API error: {response.status_code} - {response.text}")

                    result = response.json()

            processing_time = time.time() - start_time

            # Estimate duration from file size (rough: ~1MB per minute for compressed audio)
            estimated_duration = len(audio_data) / (1024 * 1024) * 60
            audio_minutes = estimated_duration / 60

            return ProviderResult(
                provider="cloud",
                text=result.get("text", ""),
                language=result.get("language", language or "unknown"),
                duration=estimated_duration,
                confidence=0.95,  # OpenAI doesn't return confidence
                processing_time_seconds=round(processing_time, 2),
                cost=round(audio_minutes * OPENAI_WHISPER_PRICE_PER_MINUTE, 4),
            )

        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)

    async def transcribe_local(
        self,
        job: TranscriptionJob,
        audio_data: bytes,
        filename: str,
        language: Optional[str] = None,
    ) -> ProviderResult:
        """Transcribe using local faster-whisper model."""
        start_time = time.time()

        # Get file extension
        ext = os.path.splitext(filename)[1] or ".wav"

        # Write to temp file (faster-whisper needs a file path)
        with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
            tmp.write(audio_data)
            tmp_path = tmp.name

        try:
            job.status = "loading_model"
            job.progress = 10
            await asyncio.sleep(0.1)

            model = self._get_model()

            job.status = "transcribing"
            job.progress = 15

            # Transcribe
            segments_iter, info = model.transcribe(
                tmp_path,
                language=language,
                beam_size=5,
                vad_filter=True,
                vad_parameters=dict(min_silence_duration_ms=500),
            )

            job.audio_duration = info.duration
            estimated_segments = max(1, int(info.duration / 7))
            job.total_segments = estimated_segments

            # Collect segments
            text_parts = []
            total_confidence = 0.0
            segment_count = 0

            for segment in segments_iter:
                segment_count += 1
                job.current_segment = segment_count

                if segment_count > job.total_segments:
                    job.total_segments = segment_count + max(1, int((info.duration - segment.end) / 7))

                text_parts.append(segment.text.strip())
                job.current_text = " ".join(text_parts)
                total_confidence += segment.avg_logprob

                progress_pct = (segment.end / info.duration) * 80 if info.duration > 0 else 0
                job.progress = min(95, 15 + progress_pct)

                await asyncio.sleep(0.01)

            job.total_segments = segment_count

            # Calculate confidence
            avg_confidence = 0.0
            if segment_count > 0:
                avg_logprob = total_confidence / segment_count
                avg_confidence = min(1.0, max(0.0, 1.0 + avg_logprob))

            processing_time = time.time() - start_time
            audio_minutes = info.duration / 60

            return ProviderResult(
                provider="local",
                text=" ".join(text_parts),
                language=info.language,
                duration=info.duration,
                confidence=round(avg_confidence, 3),
                processing_time_seconds=round(processing_time, 2),
                cost=round(audio_minutes * LOCAL_COMPUTE_COST_PER_MINUTE, 4),
            )

        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)

    async def transcribe_with_progress(
        self,
        job_id: str,
        audio_data: bytes,
        filename: str,
        language: Optional[str] = None,
        provider: Provider = "local",
    ) -> TranscriptionResult:
        """Transcribe audio data to text with progress tracking."""
        job = self._jobs.get(job_id)
        if not job:
            job = self.create_job(job_id, file_size_bytes=len(audio_data), provider=provider)
        else:
            job.file_size_bytes = len(audio_data)
            job.provider = provider

        job.start_time = time.time()
        job.status = "processing"
        job.progress = 5

        try:
            local_result: Optional[ProviderResult] = None
            cloud_result: Optional[ProviderResult] = None

            if provider in ["local", "both"]:
                local_result = await self.transcribe_local(job, audio_data, filename, language)

            if provider in ["cloud", "both"]:
                job.status = "transcribing_cloud"
                job.progress = 50 if provider == "both" else 15
                cloud_result = await self.transcribe_cloud(audio_data, filename, language)

            # Determine primary result
            if provider == "cloud":
                primary = cloud_result
            else:
                primary = local_result

            # Calculate costs
            processing_time = time.time() - job.start_time

            # Get duration from whichever result we have
            duration = primary.duration if primary else 0
            if local_result:
                duration = local_result.duration

            cost_metrics = self._calculate_costs(duration, processing_time, len(audio_data), provider)

            result = TranscriptionResult(
                text=primary.text if primary else "",
                language=primary.language if primary else "unknown",
                duration=duration,
                confidence=primary.confidence if primary else 0,
                cost_metrics=cost_metrics,
                provider=provider,
                local_result=local_result,
                cloud_result=cloud_result,
            )

            job.status = "complete"
            job.progress = 100
            job.result = result

            return result

        except Exception as e:
            job.status = "error"
            job.error = str(e)
            raise

    async def transcribe(
        self,
        audio_data: bytes,
        filename: str,
        language: Optional[str] = None,
    ) -> TranscriptionResult:
        """Transcribe audio data to text (legacy method without progress)."""
        import uuid
        job_id = str(uuid.uuid4())
        return await self.transcribe_with_progress(job_id, audio_data, filename, language)

    def get_status(self) -> dict:
        """Check if the service is ready and return model info."""
        settings = get_settings()
        cloud_available = bool(settings.openai_api_key)

        try:
            model = self._get_model()
            return {
                "status": "ready",
                "model": settings.whisper_model,
                "device": settings.whisper_device,
                "message": "Whisper model loaded and ready",
                "cloud_available": cloud_available,
            }
        except Exception as e:
            return {
                "status": "error",
                "model": None,
                "device": None,
                "message": f"Failed to load model: {str(e)}",
                "cloud_available": cloud_available,
            }


# Global service instance
whisper_service = WhisperService()

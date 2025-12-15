"""
Celery tasks for audio transcription.
"""
import asyncio
import logging
from celery import shared_task
from typing import Optional

logger = logging.getLogger(__name__)


def run_async(coro):
    """Run an async coroutine in a sync context."""
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop.run_until_complete(coro)


@shared_task(
    bind=True,
    name="app.tasks.transcription.transcribe_audio",
    max_retries=3,
    default_retry_delay=60,
    soft_time_limit=1800,
    time_limit=3600,
)
def transcribe_audio(
    self,
    job_id: str,
    filename: str,
    language: Optional[str] = None,
    provider: str = "local",
):
    """
    Celery task to transcribe audio.

    Audio data is retrieved from storage (Redis) using the job_id.
    Progress updates are saved to storage for SSE streaming.
    """
    logger.info(f"Starting transcription task for job {job_id}")

    # Import here to avoid circular imports and ensure fresh instances in worker
    from app.services.job_storage import get_job_storage
    from app.services.whisper import whisper_service

    async def _transcribe():
        storage = get_job_storage()

        # Get audio data from storage
        pending = await storage.get_audio(job_id)
        if not pending:
            logger.error(f"No audio data found for job {job_id}")
            return {"error": "Audio data not found"}

        audio_data, metadata = pending
        logger.info(f"Retrieved {len(audio_data)} bytes for job {job_id}")

        try:
            # Run transcription with progress tracking
            result = await whisper_service.transcribe_with_progress(
                job_id=job_id,
                audio_data=audio_data,
                filename=metadata.get("filename", filename),
                language=metadata.get("language", language),
                provider=metadata.get("provider", provider),
            )

            logger.info(f"Transcription complete for job {job_id}")

            return {
                "job_id": job_id,
                "status": "complete",
                "text": result.text,
                "language": result.language,
                "duration": result.duration,
                "confidence": result.confidence,
                "provider": result.provider,
            }

        except Exception as e:
            logger.error(f"Transcription failed for job {job_id}: {e}")

            # Update job status in storage
            job = whisper_service.get_job(job_id)
            if job:
                job.status = "error"
                job.error = str(e)
                await whisper_service.save_job_to_storage(job)

            raise self.retry(exc=e)

        finally:
            # Clean up audio data from storage
            await storage.delete_audio(job_id)

    return run_async(_transcribe())


@shared_task(
    bind=True,
    name="app.tasks.transcription.cleanup_old_jobs",
    max_retries=1,
)
def cleanup_old_jobs(self):
    """
    Periodic task to clean up old job data.
    Run this via Celery beat scheduler.
    """
    logger.info("Running job cleanup task")
    # Redis TTL handles expiration automatically
    # This task can be used for additional cleanup if needed
    return {"status": "cleanup_complete"}

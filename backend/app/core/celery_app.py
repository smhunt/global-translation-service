"""
Celery application configuration for distributed task processing.
"""
from celery import Celery
from app.core.config import get_settings

settings = get_settings()

# Create Celery app
celery_app = Celery(
    "transcribe_global",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=["app.tasks.transcription"],
)

# Celery configuration
celery_app.conf.update(
    # Task settings
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,

    # Task execution settings
    task_acks_late=True,  # Acknowledge after task completes (for reliability)
    task_reject_on_worker_lost=True,  # Requeue if worker dies

    # Result settings
    result_expires=3600,  # Results expire after 1 hour

    # Worker settings
    worker_prefetch_multiplier=1,  # One task at a time (transcription is heavy)
    worker_concurrency=1,  # One concurrent task per worker (GPU/CPU bound)

    # Task time limits
    task_soft_time_limit=1800,  # 30 min soft limit
    task_time_limit=3600,  # 1 hour hard limit

    # Retry settings
    task_default_retry_delay=60,  # 1 minute delay between retries
    task_max_retries=3,
)

# Task routes - can route different tasks to different queues
celery_app.conf.task_routes = {
    "app.tasks.transcription.*": {"queue": "transcription"},
}

# Define queues
celery_app.conf.task_queues = {
    "transcription": {
        "exchange": "transcription",
        "routing_key": "transcription",
    },
}

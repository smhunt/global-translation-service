"""
Job storage abstraction for transcription jobs.
Supports both in-memory (development) and Redis (production) backends.
"""
import json
import logging
from abc import ABC, abstractmethod
from typing import Optional, Dict, Any
from dataclasses import asdict

from app.core.config import get_settings

logger = logging.getLogger(__name__)


class JobStorage(ABC):
    """Abstract base class for job storage backends."""

    @abstractmethod
    async def save_job(self, job_id: str, job_data: dict) -> None:
        """Save job data."""
        pass

    @abstractmethod
    async def get_job(self, job_id: str) -> Optional[dict]:
        """Get job data by ID."""
        pass

    @abstractmethod
    async def delete_job(self, job_id: str) -> None:
        """Delete job data."""
        pass

    @abstractmethod
    async def save_audio(self, job_id: str, audio_data: bytes, metadata: dict) -> None:
        """Save pending audio data for a job."""
        pass

    @abstractmethod
    async def get_audio(self, job_id: str) -> Optional[tuple[bytes, dict]]:
        """Get pending audio data and metadata for a job."""
        pass

    @abstractmethod
    async def delete_audio(self, job_id: str) -> None:
        """Delete pending audio data."""
        pass


class MemoryJobStorage(JobStorage):
    """In-memory job storage for development."""

    def __init__(self):
        self._jobs: Dict[str, dict] = {}
        self._audio: Dict[str, tuple[bytes, dict]] = {}

    async def save_job(self, job_id: str, job_data: dict) -> None:
        self._jobs[job_id] = job_data

    async def get_job(self, job_id: str) -> Optional[dict]:
        return self._jobs.get(job_id)

    async def delete_job(self, job_id: str) -> None:
        self._jobs.pop(job_id, None)

    async def save_audio(self, job_id: str, audio_data: bytes, metadata: dict) -> None:
        self._audio[job_id] = (audio_data, metadata)

    async def get_audio(self, job_id: str) -> Optional[tuple[bytes, dict]]:
        return self._audio.get(job_id)

    async def delete_audio(self, job_id: str) -> None:
        self._audio.pop(job_id, None)


class RedisJobStorage(JobStorage):
    """Redis-backed job storage for production."""

    def __init__(self, redis_url: str, ttl: int = 3600):
        import redis.asyncio as redis
        self._redis = redis.from_url(redis_url, decode_responses=False)
        self._ttl = ttl
        self._job_prefix = "transcribe:job:"
        self._audio_prefix = "transcribe:audio:"
        self._meta_prefix = "transcribe:meta:"

    async def save_job(self, job_id: str, job_data: dict) -> None:
        key = f"{self._job_prefix}{job_id}"
        # Serialize job data to JSON
        await self._redis.setex(key, self._ttl, json.dumps(job_data))

    async def get_job(self, job_id: str) -> Optional[dict]:
        key = f"{self._job_prefix}{job_id}"
        data = await self._redis.get(key)
        if data:
            return json.loads(data)
        return None

    async def delete_job(self, job_id: str) -> None:
        key = f"{self._job_prefix}{job_id}"
        await self._redis.delete(key)

    async def save_audio(self, job_id: str, audio_data: bytes, metadata: dict) -> None:
        audio_key = f"{self._audio_prefix}{job_id}"
        meta_key = f"{self._meta_prefix}{job_id}"
        # Store audio as binary, metadata as JSON
        pipe = self._redis.pipeline()
        pipe.setex(audio_key, self._ttl, audio_data)
        pipe.setex(meta_key, self._ttl, json.dumps(metadata))
        await pipe.execute()

    async def get_audio(self, job_id: str) -> Optional[tuple[bytes, dict]]:
        audio_key = f"{self._audio_prefix}{job_id}"
        meta_key = f"{self._meta_prefix}{job_id}"
        pipe = self._redis.pipeline()
        pipe.get(audio_key)
        pipe.get(meta_key)
        results = await pipe.execute()
        if results[0] and results[1]:
            return (results[0], json.loads(results[1]))
        return None

    async def delete_audio(self, job_id: str) -> None:
        audio_key = f"{self._audio_prefix}{job_id}"
        meta_key = f"{self._meta_prefix}{job_id}"
        await self._redis.delete(audio_key, meta_key)

    async def close(self) -> None:
        """Close Redis connection."""
        await self._redis.close()


# Singleton storage instance
_storage: Optional[JobStorage] = None


def get_job_storage() -> JobStorage:
    """Get the configured job storage backend."""
    global _storage
    if _storage is None:
        settings = get_settings()
        if settings.use_redis:
            logger.info(f"Using Redis job storage: {settings.redis_url}")
            _storage = RedisJobStorage(settings.redis_url, settings.redis_job_ttl)
        else:
            logger.info("Using in-memory job storage")
            _storage = MemoryJobStorage()
    return _storage

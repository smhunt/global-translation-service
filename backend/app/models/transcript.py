from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class CostMetricsModel(BaseModel):
    audio_duration_seconds: float
    audio_duration_minutes: float
    file_size_bytes: int
    file_size_mb: float
    processing_time_seconds: float
    processing_speed_ratio: float
    cloud_api_cost: float
    local_compute_cost: float
    savings: float
    savings_percentage: float


class TranscriptCreate(BaseModel):
    """Request model for creating a transcript."""
    file_name: str
    file_size_bytes: int
    audio_duration_seconds: Optional[float] = None
    text: str
    language: Optional[str] = None
    confidence: Optional[float] = None
    provider: Optional[str] = "local"
    cost_metrics: Optional[CostMetricsModel] = None


class TranscriptResponse(BaseModel):
    """Response model for a transcript."""
    id: str
    user_id: str
    file_name: str
    file_size_bytes: int
    audio_duration_seconds: Optional[float] = None
    text: str
    language: Optional[str] = None
    confidence: Optional[float] = None
    provider: Optional[str] = None
    cost_metrics: Optional[dict] = None
    created_at: datetime


class TranscriptListResponse(BaseModel):
    """Response model for transcript list."""
    transcripts: list[TranscriptResponse]
    total: int
    page: int
    page_size: int

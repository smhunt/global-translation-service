from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import Literal


class Settings(BaseSettings):
    app_name: str = "TranscribeGlobal API"
    debug: bool = True
    api_v1_prefix: str = "/api/v1"

    # CORS
    frontend_url: str = "http://10.10.10.24:3010"

    # Whisper settings
    # Model options: tiny, base, small, medium, large-v2, large-v3
    whisper_model: str = "base"
    # Device: cpu, cuda, auto
    whisper_device: str = "cpu"
    # Compute type: int8, float16, float32 (use int8 for CPU, float16 for GPU)
    whisper_compute_type: str = "int8"

    # Ollama (for future LLM integration)
    ollama_base_url: str = "http://localhost:11434"

    class Config:
        env_file = ".env"


@lru_cache
def get_settings() -> Settings:
    return Settings()

from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    app_name: str = "TranscribeGlobal API"
    debug: bool = True
    api_v1_prefix: str = "/api/v1"

    # CORS
    frontend_url: str = "http://10.10.10.24:3010"

    # Ollama (local inference)
    ollama_base_url: str = "http://localhost:11434"

    class Config:
        env_file = ".env"


@lru_cache
def get_settings() -> Settings:
    return Settings()

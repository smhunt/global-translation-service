from supabase import create_client, Client
from functools import lru_cache
from typing import Optional
import logging

from app.core.config import get_settings

logger = logging.getLogger(__name__)


@lru_cache
def get_supabase_client() -> Optional[Client]:
    """Get Supabase client, returns None if not configured."""
    settings = get_settings()

    if not settings.supabase_url or not settings.supabase_key:
        logger.warning("Supabase not configured - transcript history disabled")
        return None

    try:
        client = create_client(settings.supabase_url, settings.supabase_key)
        return client
    except Exception as e:
        logger.error(f"Failed to create Supabase client: {e}")
        return None


def is_supabase_configured() -> bool:
    """Check if Supabase is properly configured."""
    return get_supabase_client() is not None

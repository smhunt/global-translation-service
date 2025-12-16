"""
Transcript storage service with SQLite fallback for development.
Uses Supabase if configured, otherwise falls back to local SQLite.
"""
import sqlite3
import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any
from contextlib import contextmanager
import logging

from app.core.config import get_settings
from app.services.supabase import get_supabase_client, is_supabase_configured

logger = logging.getLogger(__name__)

# SQLite database path (in backend directory)
DB_PATH = Path(__file__).parent.parent.parent / "transcripts.db"


@contextmanager
def get_db():
    """Get SQLite connection with row factory."""
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


def init_db():
    """Initialize SQLite database with transcripts table."""
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS transcripts (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                file_name TEXT NOT NULL,
                file_size_bytes INTEGER,
                audio_duration_seconds REAL,
                text TEXT NOT NULL,
                language TEXT,
                confidence REAL,
                provider TEXT,
                cost_metrics TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_user_id ON transcripts(user_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_created_at ON transcripts(created_at)")
        conn.commit()
    logger.info(f"SQLite database initialized at {DB_PATH}")


# Initialize on module load
init_db()


class TranscriptStorage:
    """Unified storage interface for transcripts."""

    def __init__(self):
        self.use_supabase = is_supabase_configured()
        if self.use_supabase:
            logger.info("Using Supabase for transcript storage")
        else:
            logger.info("Using SQLite for transcript storage (development mode)")

    def is_available(self) -> bool:
        """Check if storage is available."""
        return True  # SQLite fallback always available

    def create(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new transcript."""
        transcript_id = data.get("id") or str(uuid.uuid4())

        if self.use_supabase:
            client = get_supabase_client()
            data["id"] = transcript_id
            result = client.table("transcripts").insert(data).execute()
            if result.data:
                return result.data[0]
            raise Exception("Failed to insert into Supabase")

        # SQLite fallback
        with get_db() as conn:
            cost_metrics_json = json.dumps(data.get("cost_metrics")) if data.get("cost_metrics") else None
            created_at = datetime.utcnow().isoformat()

            conn.execute("""
                INSERT INTO transcripts
                (id, user_id, file_name, file_size_bytes, audio_duration_seconds,
                 text, language, confidence, provider, cost_metrics, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                transcript_id,
                data["user_id"],
                data["file_name"],
                data.get("file_size_bytes"),
                data.get("audio_duration_seconds"),
                data["text"],
                data.get("language"),
                data.get("confidence"),
                data.get("provider"),
                cost_metrics_json,
                created_at,
            ))
            conn.commit()

            return {
                "id": transcript_id,
                "user_id": data["user_id"],
                "file_name": data["file_name"],
                "file_size_bytes": data.get("file_size_bytes"),
                "audio_duration_seconds": data.get("audio_duration_seconds"),
                "text": data["text"],
                "language": data.get("language"),
                "confidence": data.get("confidence"),
                "provider": data.get("provider"),
                "cost_metrics": data.get("cost_metrics"),
                "created_at": created_at,
            }

    def list(self, user_id: str, page: int = 1, page_size: int = 20) -> tuple[List[Dict[str, Any]], int]:
        """List transcripts for a user with pagination."""
        if self.use_supabase:
            client = get_supabase_client()

            # Get count
            count_result = client.table("transcripts").select("id", count="exact").eq("user_id", user_id).execute()
            total = count_result.count or 0

            # Get paginated results
            offset = (page - 1) * page_size
            result = (
                client.table("transcripts")
                .select("*")
                .eq("user_id", user_id)
                .order("created_at", desc=True)
                .range(offset, offset + page_size - 1)
                .execute()
            )

            return result.data, total

        # SQLite fallback
        with get_db() as conn:
            # Get count
            cursor = conn.execute(
                "SELECT COUNT(*) FROM transcripts WHERE user_id = ?",
                (user_id,)
            )
            total = cursor.fetchone()[0]

            # Get paginated results
            offset = (page - 1) * page_size
            cursor = conn.execute("""
                SELECT * FROM transcripts
                WHERE user_id = ?
                ORDER BY created_at DESC
                LIMIT ? OFFSET ?
            """, (user_id, page_size, offset))

            rows = cursor.fetchall()
            transcripts = []
            for row in rows:
                transcript = dict(row)
                if transcript.get("cost_metrics"):
                    transcript["cost_metrics"] = json.loads(transcript["cost_metrics"])
                transcripts.append(transcript)

            return transcripts, total

    def get(self, transcript_id: str, user_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific transcript."""
        if self.use_supabase:
            client = get_supabase_client()
            result = (
                client.table("transcripts")
                .select("*")
                .eq("id", transcript_id)
                .eq("user_id", user_id)
                .single()
                .execute()
            )
            return result.data

        # SQLite fallback
        with get_db() as conn:
            cursor = conn.execute(
                "SELECT * FROM transcripts WHERE id = ? AND user_id = ?",
                (transcript_id, user_id)
            )
            row = cursor.fetchone()
            if row:
                transcript = dict(row)
                if transcript.get("cost_metrics"):
                    transcript["cost_metrics"] = json.loads(transcript["cost_metrics"])
                return transcript
            return None

    def delete(self, transcript_id: str, user_id: str) -> bool:
        """Delete a transcript."""
        if self.use_supabase:
            client = get_supabase_client()
            result = (
                client.table("transcripts")
                .delete()
                .eq("id", transcript_id)
                .eq("user_id", user_id)
                .execute()
            )
            return bool(result.data)

        # SQLite fallback
        with get_db() as conn:
            cursor = conn.execute(
                "DELETE FROM transcripts WHERE id = ? AND user_id = ?",
                (transcript_id, user_id)
            )
            conn.commit()
            return cursor.rowcount > 0


# Global storage instance
_storage: Optional[TranscriptStorage] = None


def get_transcript_storage() -> TranscriptStorage:
    """Get the transcript storage singleton."""
    global _storage
    if _storage is None:
        _storage = TranscriptStorage()
    return _storage

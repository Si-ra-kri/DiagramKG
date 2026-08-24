"""
SQLite-backed metadata store for diagram records.

Stores: diagram id, filename, processing status, entity/relationship counts,
raw extraction JSON (for audit/debugging), and error messages.

Uses Python's built-in sqlite3 — no ORM dependency.
The database lives at backend/data/diagramkg.db.
"""
from __future__ import annotations

import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

# Resolve DB path relative to this file: services/ -> app/ -> backend/ -> data/
_DB_PATH = Path(__file__).parent.parent.parent / "data" / "diagramkg.db"


class MetadataStore:
    def __init__(self, db_path: Path = _DB_PATH):
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        return conn

    # ------------------------------------------------------------------
    # Schema
    # ------------------------------------------------------------------

    def init_schema(self) -> None:
        """Create tables if they don't already exist."""
        with self._connect() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS diagrams (
                    id                   TEXT PRIMARY KEY,
                    filename             TEXT NOT NULL,
                    original_filename    TEXT NOT NULL,
                    status               TEXT NOT NULL DEFAULT 'processing',
                    entity_count         INTEGER DEFAULT 0,
                    relationship_count   INTEGER DEFAULT 0,
                    raw_extraction_json  TEXT,
                    error_message        TEXT,
                    created_at           TEXT NOT NULL
                )
            """)

    # ------------------------------------------------------------------
    # CRUD
    # ------------------------------------------------------------------

    def create_diagram(self, filename: str, original_filename: str) -> str:
        """Insert a new diagram row in 'processing' state. Returns the new UUID."""
        diagram_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO diagrams (id, filename, original_filename, status, created_at)
                VALUES (?, ?, ?, 'processing', ?)
                """,
                (diagram_id, filename, original_filename, now),
            )
        return diagram_id

    def update_diagram(
        self,
        diagram_id: str,
        status: str,
        entity_count: int = 0,
        relationship_count: int = 0,
        raw_extraction_json: Optional[str] = None,
        error_message: Optional[str] = None,
    ) -> None:
        """Update extraction results and status for an existing diagram."""
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE diagrams
                SET status=?, entity_count=?, relationship_count=?,
                    raw_extraction_json=?, error_message=?
                WHERE id=?
                """,
                (
                    status,
                    entity_count,
                    relationship_count,
                    raw_extraction_json,
                    error_message,
                    diagram_id,
                ),
            )

    def get_diagram(self, diagram_id: str) -> Optional[dict]:
        """Return a single diagram row as a dict, or None if not found."""
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM diagrams WHERE id=?", (diagram_id,)
            ).fetchone()
        return dict(row) if row else None

    def list_diagrams(self) -> list[dict]:
        """Return all diagrams ordered by creation date (newest first)."""
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM diagrams ORDER BY created_at DESC"
            ).fetchall()
        return [dict(r) for r in rows]

    def delete_diagram(self, diagram_id: str) -> bool:
        """Delete a diagram record. Returns True if a row was deleted."""
        with self._connect() as conn:
            cursor = conn.execute("DELETE FROM diagrams WHERE id=?", (diagram_id,))
        return cursor.rowcount > 0

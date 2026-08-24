"""
Pydantic schemas shared across the API layer and service layer.
These are the canonical data shapes for diagrams, knowledge graph, and chat.
"""
from __future__ import annotations

from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel


# ---------------------------------------------------------------------------
# Diagram
# ---------------------------------------------------------------------------


class DiagramStatus(str, Enum):
    processing = "processing"
    ready = "ready"
    failed = "failed"


class DiagramOut(BaseModel):
    """API response shape for a single diagram record."""
    id: str
    filename: str
    original_filename: str
    status: DiagramStatus
    entity_count: int
    relationship_count: int
    created_at: str
    thumbnail_url: Optional[str] = None
    error_message: Optional[str] = None


# ---------------------------------------------------------------------------
# Knowledge graph
# ---------------------------------------------------------------------------


class GraphNode(BaseModel):
    """A single entity node in the knowledge graph."""
    id: str
    label: str
    type: str
    attributes: dict[str, Any] = {}


class GraphEdge(BaseModel):
    """A directed relationship between two nodes."""
    source_id: str
    target_id: str
    relationship: str
    attributes: dict[str, Any] = {}


class GraphData(BaseModel):
    """Complete or partial knowledge graph (nodes + edges)."""
    nodes: list[GraphNode] = []
    edges: list[GraphEdge] = []


# ---------------------------------------------------------------------------
# Chat
# ---------------------------------------------------------------------------


class ChatRequest(BaseModel):
    question: str


class SourceReference(BaseModel):
    """A node or edge that was used to ground an answer."""
    type: str           # "node" or "edge"
    id: str
    label: str
    detail: Optional[str] = None  # e.g. entity type, or relationship label


class ChatResponse(BaseModel):
    answer: str
    sources: list[SourceReference] = []
    question: str

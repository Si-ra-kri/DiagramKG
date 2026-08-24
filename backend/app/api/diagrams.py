"""
FastAPI router for all /api/diagrams/* endpoints.

Endpoints:
  POST   /api/diagrams              Upload + process a diagram
  GET    /api/diagrams              List all diagrams
  GET    /api/diagrams/{id}         Get diagram metadata / status
  GET    /api/diagrams/{id}/graph   Return full graph as JSON
  POST   /api/diagrams/{id}/chat    Q&A over the knowledge graph
  DELETE /api/diagrams/{id}         Delete a diagram and its graph
"""
from __future__ import annotations

import logging
import uuid
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, Request, UploadFile, status

from app.config import settings
from app.models.diagram import (
    ChatRequest,
    ChatResponse,
    DiagramOut,
    DiagramStatus,
    GraphData,
)
from app.services.chat import ChatService
from app.services.extraction import extract_graph_from_image, graph_data_to_raw_json

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/diagrams", tags=["diagrams"])

# Shared in-memory chat service (per-diagram history)
_chat_service = ChatService()

# Accepted MIME types for uploaded images
_ALLOWED_CONTENT_TYPES = {
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _get_stores(request: Request):
    """Pull MetadataStore and Neo4jStore from app.state."""
    return request.app.state.metadata_store, request.app.state.neo4j_store


def _row_to_diagram_out(row: dict, request: Request) -> DiagramOut:
    """Convert a SQLite row dict to the API response model."""
    thumbnail_url = None
    if row.get("filename"):
        base = str(request.base_url).rstrip("/")
        thumbnail_url = f"{base}/uploads/{row['filename']}"
    return DiagramOut(
        id=row["id"],
        filename=row["filename"],
        original_filename=row["original_filename"],
        status=DiagramStatus(row["status"]),
        entity_count=row.get("entity_count", 0) or 0,
        relationship_count=row.get("relationship_count", 0) or 0,
        created_at=row["created_at"],
        thumbnail_url=thumbnail_url,
        error_message=row.get("error_message"),
    )


# ---------------------------------------------------------------------------
# POST /api/diagrams — Upload and process a new diagram
# ---------------------------------------------------------------------------


@router.post("", status_code=status.HTTP_201_CREATED, response_model=DiagramOut)
async def upload_diagram(request: Request, file: UploadFile = File(...)):
    """
    Upload a diagram image, extract a knowledge graph from it, and store
    the graph in Neo4j. Returns immediately with the diagram record.

    Processing is synchronous in v1 (code is structured to move to a
    background task later by wrapping extraction in asyncio.to_thread or
    a task queue).
    """
    meta_store, neo4j_store = _get_stores(request)

    # --- Validate MIME type ---
    if file.content_type not in _ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unsupported file type '{file.content_type}'. "
                f"Allowed: {sorted(_ALLOWED_CONTENT_TYPES)}"
            ),
        )

    # --- Read and size-check ---
    content = await file.read()
    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File size {len(content) // (1024*1024)} MB exceeds the {settings.max_upload_size_mb} MB limit",
        )

    # --- Save to disk ---
    ext = Path(file.filename or "upload.png").suffix.lower() or ".png"
    saved_filename = f"{uuid.uuid4()}{ext}"
    upload_path = Path(settings.upload_dir) / saved_filename
    upload_path.write_bytes(content)
    logger.info(f"Saved upload: {upload_path}")

    # --- Create metadata record (status = 'processing') ---
    diagram_id = meta_store.create_diagram(
        filename=saved_filename,
        original_filename=file.filename or "upload",
    )

    # --- Extract graph (synchronous v1) ---
    try:
        graph_data = extract_graph_from_image(upload_path, diagram_id)
        neo4j_store.write_graph(diagram_id, graph_data)
        meta_store.update_diagram(
            diagram_id=diagram_id,
            status="ready",
            entity_count=len(graph_data.nodes),
            relationship_count=len(graph_data.edges),
            raw_extraction_json=graph_data_to_raw_json(graph_data),
        )
    except Exception as exc:
        # Never let a failed extraction crash the request — record the error
        logger.exception(f"[{diagram_id}] Extraction failed: {exc}")
        meta_store.update_diagram(
            diagram_id=diagram_id,
            status="failed",
            error_message=str(exc)[:500],
        )

    row = meta_store.get_diagram(diagram_id)
    return _row_to_diagram_out(row, request)


# ---------------------------------------------------------------------------
# GET /api/diagrams — List all diagrams
# ---------------------------------------------------------------------------


@router.get("", response_model=list[DiagramOut])
async def list_diagrams(request: Request):
    meta_store, _ = _get_stores(request)
    rows = meta_store.list_diagrams()
    return [_row_to_diagram_out(r, request) for r in rows]


# ---------------------------------------------------------------------------
# GET /api/diagrams/{id} — Get diagram status and metadata
# ---------------------------------------------------------------------------


@router.get("/{diagram_id}", response_model=DiagramOut)
async def get_diagram(diagram_id: str, request: Request):
    meta_store, _ = _get_stores(request)
    row = meta_store.get_diagram(diagram_id)
    if not row:
        raise HTTPException(status_code=404, detail=f"Diagram '{diagram_id}' not found")
    return _row_to_diagram_out(row, request)


# ---------------------------------------------------------------------------
# GET /api/diagrams/{id}/graph — Full graph as JSON
# ---------------------------------------------------------------------------


@router.get("/{diagram_id}/graph", response_model=GraphData)
async def get_diagram_graph(diagram_id: str, request: Request):
    meta_store, neo4j_store = _get_stores(request)
    row = meta_store.get_diagram(diagram_id)
    if not row:
        raise HTTPException(status_code=404, detail=f"Diagram '{diagram_id}' not found")
    if row["status"] != "ready":
        raise HTTPException(
            status_code=409,
            detail=f"Diagram is not ready (current status: {row['status']})",
        )
    return neo4j_store.get_graph(diagram_id)


# ---------------------------------------------------------------------------
# POST /api/diagrams/{id}/chat — Q&A
# ---------------------------------------------------------------------------


@router.post("/{diagram_id}/chat", response_model=ChatResponse)
async def chat_with_diagram(
    diagram_id: str, body: ChatRequest, request: Request
):
    """Answer a natural-language question using the diagram's knowledge graph."""
    meta_store, neo4j_store = _get_stores(request)

    row = meta_store.get_diagram(diagram_id)
    if not row:
        raise HTTPException(status_code=404, detail=f"Diagram '{diagram_id}' not found")
    if row["status"] != "ready":
        raise HTTPException(
            status_code=409,
            detail="Diagram is not ready. Please wait for extraction to complete.",
        )
    if not body.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    try:
        return _chat_service.answer_question(diagram_id, body.question, neo4j_store)
    except Exception as exc:
        logger.exception(f"[{diagram_id}] Chat error: {exc}")
        raise HTTPException(
            status_code=500,
            detail=f"Chat service error: {str(exc)[:300]}",
        )


# ---------------------------------------------------------------------------
# DELETE /api/diagrams/{id} — Remove a diagram
# ---------------------------------------------------------------------------


@router.delete("/{diagram_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_diagram(diagram_id: str, request: Request):
    meta_store, neo4j_store = _get_stores(request)

    row = meta_store.get_diagram(diagram_id)
    if not row:
        raise HTTPException(status_code=404, detail=f"Diagram '{diagram_id}' not found")

    # Remove graph from Neo4j
    neo4j_store.delete_diagram_graph(diagram_id)

    # Remove uploaded image file
    upload_path = Path(settings.upload_dir) / row["filename"]
    if upload_path.exists():
        upload_path.unlink()
        logger.info(f"Deleted file: {upload_path}")

    # Remove metadata record and clear chat history
    meta_store.delete_diagram(diagram_id)
    _chat_service.clear_history(diagram_id)

    logger.info(f"Diagram {diagram_id} fully deleted")

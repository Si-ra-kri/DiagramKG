"""
FastAPI application entrypoint.

Startup sequence:
  1. Create upload directory (needed before StaticFiles mount).
  2. Initialize SQLite metadata store schema.
  3. Connect to Neo4j and create indexes.
  4. Register routers and middleware.

All shared resources (metadata_store, neo4j_store) are attached to app.state
so routers can access them via Request without globals.
"""
from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.api import diagrams as diagrams_router
from app.services.graph_store import Neo4jStore
from app.services.metadata_store import MetadataStore

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)

# Ensure upload directory exists before StaticFiles mount (which validates it)
os.makedirs(settings.upload_dir, exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle."""
    # ---- Startup ----
    logger.info(f"Upload directory: {settings.upload_dir}")

    # SQLite metadata store
    meta_store = MetadataStore()
    meta_store.init_schema()
    app.state.metadata_store = meta_store
    logger.info("SQLite metadata store ready")

    # Neo4j
    neo4j_store = Neo4jStore(
        uri=settings.neo4j_uri,
        user=settings.neo4j_user,
        password=settings.neo4j_password,
    )
    if neo4j_store.verify_connectivity():
        neo4j_store.ensure_indexes()
        logger.info(f"Neo4j connected: {settings.neo4j_uri}")
    else:
        logger.warning(
            "Neo4j not reachable at startup. "
            "Start Neo4j with: docker-compose up -d"
        )
    app.state.neo4j_store = neo4j_store

    yield

    # ---- Shutdown ----
    neo4j_store.close()
    logger.info("Neo4j connection closed")


# ---------------------------------------------------------------------------
# Application
# ---------------------------------------------------------------------------

app = FastAPI(
    title="DiagramKG API",
    description="Convert diagram images into queryable knowledge graphs",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS — allow Vite dev server to call the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve uploaded images as static files at /uploads/<filename>
app.mount(
    "/uploads",
    StaticFiles(directory=settings.upload_dir),
    name="uploads",
)

# API routes
app.include_router(diagrams_router.router, prefix="/api")


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------


@app.get("/health", tags=["health"])
async def health_check(request: Request):
    """
    Returns server health and Neo4j connectivity.
    Useful for verifying the setup before uploading diagrams.
    """
    neo4j_ok = False
    try:
        neo4j_ok = request.app.state.neo4j_store.verify_connectivity()
    except Exception:
        pass
    return {
        "status": "ok",
        "neo4j": neo4j_ok,
        "upload_dir": settings.upload_dir,
        "model": settings.claude_model,
    }

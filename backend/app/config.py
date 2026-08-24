"""
Application configuration — loads all settings from environment variables.

Supports three LLM providers (switch via LLM_PROVIDER):
  - "anthropic"  → Claude (requires ANTHROPIC_API_KEY, has costs)
  - "google"     → Gemini (requires GOOGLE_API_KEY, free tier available)
  - "groq"       → Llama 4 Scout on Groq (requires GROQ_API_KEY, free tier, very fast)

All required vars are validated at import time.
"""
from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv

# Resolve .env relative to: app/config.py -> app/ -> backend/ -> diagramkg/ -> .env
_env_path = os.path.join(os.path.dirname(__file__), "..", "..", ".env")
load_dotenv(dotenv_path=os.path.abspath(_env_path))


def _require(key: str) -> str:
    """Return the value of a required env var or raise a descriptive RuntimeError."""
    value = os.getenv(key, "").strip()
    if not value:
        raise RuntimeError(
            f"\n\nMissing required environment variable: {key}\n"
            "Copy .env.example to .env and fill in your values.\n"
        )
    return value


def _resolve_upload_dir(raw: str) -> str:
    """Resolve upload dir to an absolute path relative to backend/."""
    if os.path.isabs(raw):
        return raw
    backend_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    return os.path.join(backend_root, raw)


@dataclass(frozen=True)
class Settings:
    # --- Provider selection ---
    llm_provider: str           # "anthropic" | "google"

    # --- Anthropic (only required when llm_provider = anthropic) ---
    anthropic_api_key: str
    claude_model: str

    # --- Google Gemini (only required when llm_provider = google) ---
    google_api_key: str
    gemini_model: str

    # --- Groq (only required when llm_provider = groq) ---
    groq_api_key: str
    groq_model: str

    # --- OpenRouter (only required when llm_provider = openrouter) ---
    openrouter_api_key: str
    openrouter_model: str  # must be a vision-capable model

    # --- Neo4j ---
    neo4j_uri: str
    neo4j_user: str
    neo4j_password: str

    # --- Storage ---
    upload_dir: str             # always absolute
    max_upload_size_mb: int


def _load_settings() -> Settings:
    provider = os.getenv("LLM_PROVIDER", "anthropic").strip().lower()

    if provider not in ("anthropic", "google", "groq", "openrouter"):
        raise RuntimeError(
            f"Unknown LLM_PROVIDER='{provider}'. "
            f"Choose 'anthropic', 'google', 'groq', or 'openrouter'."
        )

    # Only require the key for the selected provider
    anthropic_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
    google_key = os.getenv("GOOGLE_API_KEY", "").strip()
    groq_key = os.getenv("GROQ_API_KEY", "").strip()
    openrouter_key = os.getenv("OPENROUTER_API_KEY", "").strip()

    if provider == "anthropic" and not anthropic_key:
        raise RuntimeError(
            "\n\nLLM_PROVIDER=anthropic requires ANTHROPIC_API_KEY.\n"
            "Or switch to a free provider:\n"
            "  LLM_PROVIDER=openrouter  +  OPENROUTER_API_KEY  (free at https://openrouter.ai)\n"
        )
    if provider == "google" and not google_key:
        raise RuntimeError(
            "\n\nLLM_PROVIDER=google requires GOOGLE_API_KEY.\n"
            "Get a free key at: https://aistudio.google.com/apikey\n"
        )
    if provider == "groq" and not groq_key:
        raise RuntimeError(
            "\n\nLLM_PROVIDER=groq requires GROQ_API_KEY.\n"
            "Get a free key at: https://console.groq.com/keys\n"
        )
    if provider == "openrouter" and not openrouter_key:
        raise RuntimeError(
            "\n\nLLM_PROVIDER=openrouter requires OPENROUTER_API_KEY.\n"
            "Get a free key at: https://openrouter.ai (no credit card needed)\n"
        )

    return Settings(
        llm_provider=provider,
        anthropic_api_key=anthropic_key,
        claude_model=os.getenv("CLAUDE_MODEL", "claude-sonnet-4-5"),
        google_api_key=google_key,
        gemini_model=os.getenv("GEMINI_MODEL", "gemini-2.0-flash"),
        groq_api_key=groq_key,
        groq_model=os.getenv("GROQ_MODEL", "llama-3.2-11b-vision-preview"),
        openrouter_api_key=openrouter_key,
        openrouter_model=os.getenv(
            "OPENROUTER_MODEL", "meta-llama/llama-3.2-11b-vision-instruct:free"
        ),
        neo4j_uri=os.getenv("NEO4J_URI", "bolt://localhost:7687"),
        neo4j_user=os.getenv("NEO4J_USER", "neo4j"),
        neo4j_password=os.getenv("NEO4J_PASSWORD", "diagramkg"),
        upload_dir=_resolve_upload_dir(os.getenv("UPLOAD_DIR", "uploads")),
        max_upload_size_mb=int(os.getenv("MAX_UPLOAD_SIZE_MB", "20")),
    )


# Module-level singleton imported by all other modules.
settings = _load_settings()

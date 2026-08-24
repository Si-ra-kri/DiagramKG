"""
Provider-agnostic LLM client.

Supports:
  - AnthropicClient  → Claude vision + text  (requires paid credits)
  - GoogleClient     → Gemini vision + text  (free tier: 1,500 req/day)

Usage:
    from app.services.llm_client import get_llm_client
    client = get_llm_client()
    text = client.vision_complete(image_bytes, media_type, system_prompt, user_prompt)
    text = client.text_complete(system_prompt, messages)

Switch provider via LLM_PROVIDER env var ("anthropic" | "google").
"""
from __future__ import annotations

import base64
import logging
from abc import ABC, abstractmethod

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Abstract base
# ---------------------------------------------------------------------------

class BaseLLMClient(ABC):
    """Minimal interface required by extraction.py and chat.py."""

    @abstractmethod
    def vision_complete(
        self,
        image_bytes: bytes,
        media_type: str,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int = 8192,
    ) -> str:
        """Analyze an image and return raw text."""

    @abstractmethod
    def text_complete(
        self,
        system_prompt: str,
        messages: list[dict],
        max_tokens: int = 1024,
    ) -> str:
        """Complete a message list and return raw text."""


# ---------------------------------------------------------------------------
# Anthropic (Claude)
# ---------------------------------------------------------------------------

class AnthropicClient(BaseLLMClient):
    """Uses the Anthropic Python SDK."""

    def __init__(self, api_key: str, model: str):
        import anthropic
        self._client = anthropic.Anthropic(api_key=api_key)
        self._model = model
        logger.info(f"LLM provider: Anthropic ({model})")

    def vision_complete(self, image_bytes, media_type, system_prompt, user_prompt,
                        max_tokens=8192):
        response = self._client.messages.create(
            model=self._model,
            max_tokens=max_tokens,
            system=system_prompt,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": media_type,
                                "data": base64.standard_b64encode(image_bytes).decode(),
                            },
                        },
                        {"type": "text", "text": user_prompt},
                    ],
                }
            ],
        )
        return response.content[0].text

    def text_complete(self, system_prompt, messages, max_tokens=1024):
        response = self._client.messages.create(
            model=self._model,
            max_tokens=max_tokens,
            system=system_prompt,
            messages=messages,
        )
        return response.content[0].text


# ---------------------------------------------------------------------------
# Google Gemini (free tier)
# ---------------------------------------------------------------------------

class GoogleClient(BaseLLMClient):
    """
    Uses the new google-genai SDK (pip install google-genai).
    This SDK uses the stable v1 API endpoint.
    Free tier: 1,500 requests/day for gemini-2.0-flash — no credit card needed.
    Get a free key at: https://aistudio.google.com/apikey
    """

    def __init__(self, api_key: str, model: str):
        from google import genai
        self._client = genai.Client(api_key=api_key)
        self._model = model
        logger.info(f"LLM provider: Google Gemini ({model})")

    def vision_complete(self, image_bytes, media_type, system_prompt, user_prompt,
                        max_tokens=8192):
        from google import genai
        from google.genai import types

        response = self._client.models.generate_content(
            model=self._model,
            contents=[
                types.Part.from_bytes(data=image_bytes, mime_type=media_type),
                user_prompt,
            ],
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                max_output_tokens=max_tokens,
            ),
        )
        return response.text

    def text_complete(self, system_prompt, messages, max_tokens=1024):
        from google.genai import types

        # Convert Anthropic-style message list to Gemini Contents.
        # Gemini uses "model" for the assistant role.
        gemini_history = []
        for msg in messages[:-1]:
            role = "user" if msg["role"] == "user" else "model"
            gemini_history.append(
                types.Content(
                    role=role,
                    parts=[types.Part.from_text(text=msg["content"])],
                )
            )

        # Start a chat with history, send the latest message
        chat = self._client.chats.create(
            model=self._model,
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                max_output_tokens=max_tokens,
            ),
            history=gemini_history,
        )
        response = chat.send_message(messages[-1]["content"])
        return response.text


# ---------------------------------------------------------------------------
# Generic OpenAI-compatible client (Groq, OpenRouter, Together, etc.)
# ---------------------------------------------------------------------------

class OpenAICompatibleClient(BaseLLMClient):
    """
    Generic client for any OpenAI-compatible API (same message format).
    Works with:
      - Groq        (base_url=https://api.groq.com/openai/v1)
      - OpenRouter  (base_url=https://openrouter.ai/api/v1)  ← FREE vision models

    OpenRouter free vision models (no credit card):
      - meta-llama/llama-3.2-11b-vision-instruct:free
      - google/gemini-2.0-flash-exp:free
      - qwen/qwen2.5-vl-7b-instruct:free

    Get a free OpenRouter key at: https://openrouter.ai
    """

    def __init__(self, api_key: str, model: str, base_url: str,
                 provider_name: str = "OpenAI-compatible"):
        from openai import OpenAI
        self._client = OpenAI(api_key=api_key, base_url=base_url)
        self._model = model
        logger.info(f"LLM provider: {provider_name} ({model})")

    def vision_complete(self, image_bytes, media_type, system_prompt, user_prompt,
                        max_tokens=8192):
        import base64
        b64 = base64.standard_b64encode(image_bytes).decode()
        response = self._client.chat.completions.create(
            model=self._model,
            messages=[
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{media_type};base64,{b64}"
                            },
                        },
                        {"type": "text", "text": user_prompt},
                    ],
                },
            ],
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content

    def text_complete(self, system_prompt, messages, max_tokens=1024):
        full_messages = [{"role": "system", "content": system_prompt}, *messages]
        response = self._client.chat.completions.create(
            model=self._model,
            messages=full_messages,
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

def get_llm_client() -> BaseLLMClient:
    """Return the vision+text client based on LLM_PROVIDER (used for extraction)."""
    from app.config import settings

    if settings.llm_provider == "google":
        return GoogleClient(api_key=settings.google_api_key, model=settings.gemini_model)

    if settings.llm_provider == "groq":
        return OpenAICompatibleClient(
            api_key=settings.groq_api_key,
            model=settings.groq_model,
            base_url="https://api.groq.com/openai/v1",
            provider_name="Groq",
        )

    if settings.llm_provider == "openrouter":
        return OpenAICompatibleClient(
            api_key=settings.openrouter_api_key,
            model=settings.openrouter_model,
            base_url="https://openrouter.ai/api/v1",
            provider_name="OpenRouter",
        )

    return AnthropicClient(api_key=settings.anthropic_api_key, model=settings.claude_model)


def get_text_llm_client() -> BaseLLMClient:
    """
    Return the fastest available text-only client for chat Q&A.

    Priority:
      1. Groq  — free, ~200 tok/s, no vision needed for chat
      2. Falls back to the main LLM_PROVIDER client

    This keeps chat instant (~1-2s) even when extraction uses a slow
    free-tier vision model (30-90s).
    """
    from app.config import settings

    groq_key = settings.groq_api_key.strip()
    if groq_key and settings.llm_provider != "groq":
        # Use Groq's fast text model for chat regardless of vision provider
        logger.info("Chat using Groq (fast text path)")
        return OpenAICompatibleClient(
            api_key=groq_key,
            model="llama-3.3-70b-versatile",  # fast, free, great quality
            base_url="https://api.groq.com/openai/v1",
            provider_name="Groq (chat)",
        )

    # Fallback: same provider as extraction
    return get_llm_client()

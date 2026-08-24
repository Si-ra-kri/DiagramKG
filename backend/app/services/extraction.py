"""
Vision LLM extraction service.

Sends a diagram image to Claude (vision model) and extracts a structured
knowledge graph (nodes + edges) as JSON.

Pipeline:
  1. Encode image as base64.
  2. Send to Claude with a strict JSON extraction prompt.
  3. Parse JSON → validate → build GraphData.
  4. If JSON is malformed, send a repair prompt and try once more.
  5. If repair also fails, raise ValueError with full context for debugging.
"""
from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any

from app.models.diagram import GraphData, GraphEdge, GraphNode
from app.services.llm_client import BaseLLMClient, get_llm_client

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------

EXTRACTION_SYSTEM_PROMPT = """\
You are an expert knowledge-graph extractor. You will receive an image of a diagram.
The diagram may be from any domain: biology, engineering, software architecture,
organizational charts, network topology, chemistry, physics, or anything else.

Extract ALL labeled entities and ALL relationships visible in the diagram.

Output ONLY a single valid JSON object — no markdown code fences, no prose, \
no explanation before or after.

Required schema:
{
  "nodes": [
    {
      "id": "<unique snake_case identifier, e.g. mitochondria_1, router_core, ceo>",
      "label": "<human-readable name exactly as it appears in the diagram>",
      "type": "<entity type inferred from context, e.g. organelle, router, person, gear, component>",
      "attributes": {
        "<key>": "<value>"
      }
    }
  ],
  "edges": [
    {
      "source_id": "<id of source node>",
      "target_id": "<id of target node>",
      "relationship": "<concise ALL_CAPS label, e.g. CONTAINS, CONNECTS_TO, PRODUCES, INHIBITS, REPORTS_TO>",
      "attributes": {}
    }
  ]
}

Rules:
1. Every node id must be globally unique within this response and use snake_case.
2. Every edge source_id and target_id must reference a valid node id in the nodes list.
3. Deduplicate nodes — if the same entity appears multiple times, create one node.
4. Infer 'type' from visual/textual context; do NOT hardcode domain-specific types.
5. Capture ALL arrows, lines, labels, and connections you can see.
6. Omit an attribute key entirely if the value is unclear rather than guessing.
7. If the diagram has no relationships, return an empty edges array.
8. Output ONLY the JSON object — nothing else whatsoever.\
"""

REPAIR_PROMPT_TEMPLATE = """\
Your previous response could not be parsed as valid JSON.
Parse error: {error}

Your previous (broken) response:
{bad_response}

Please output ONLY the corrected JSON object — no markdown fences, no explanation.\
"""


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def extract_graph_from_image(image_path: str | Path, diagram_id: str) -> GraphData:
    """
    Extract entities and relationships from a diagram image using Claude vision.

    Args:
        image_path: Absolute path to the uploaded image.
        diagram_id: UUID of the owning diagram (for logging only).

    Returns:
        Validated GraphData with nodes and edges.

    Raises:
        ValueError: If parsing fails after the repair attempt.
        Exception: On LLM API failures.
    """
    image_path = Path(image_path)
    media_type = _get_media_type(image_path)
    image_bytes = image_path.read_bytes()

    client = get_llm_client()
    logger.info(f"[{diagram_id}] Sending image to LLM for extraction")
    raw = _call_vision_llm(client, image_bytes, media_type)

    # First parse attempt
    _first_error: Exception | None = None
    try:
        graph_data = _parse_and_validate(raw)
        logger.info(
            f"[{diagram_id}] Extraction OK — "
            f"{len(graph_data.nodes)} nodes, {len(graph_data.edges)} edges"
        )
        return graph_data
    except Exception as exc:
        _first_error = exc  # save before Python deletes the except-scoped variable
        logger.warning(
            f"[{diagram_id}] First parse failed: {exc}. Attempting repair."
        )

    # Repair attempt
    repair_raw = _call_repair_llm(client, raw, str(_first_error))
    try:
        graph_data = _parse_and_validate(repair_raw)
        logger.info(
            f"[{diagram_id}] Repair OK — "
            f"{len(graph_data.nodes)} nodes, {len(graph_data.edges)} edges"
        )
        return graph_data
    except Exception as second_error:
        repair_preview = repair_raw[:500] if repair_raw else "(empty/null response)"
        raise ValueError(
            f"Extraction failed after repair. "
            f"First error: {_first_error}. "
            f"Second error: {second_error}. "
            f"Repaired response (first 500 chars): {repair_preview}"
        )


def graph_data_to_raw_json(graph_data: GraphData) -> str:
    """Serialize GraphData to a JSON string for metadata storage."""
    return json.dumps(
        {
            "nodes": [n.model_dump() for n in graph_data.nodes],
            "edges": [e.model_dump() for e in graph_data.edges],
        },
        indent=2,
    )


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------


def _call_vision_llm(
    client: BaseLLMClient, image_bytes: bytes, media_type: str
) -> str:
    """Send the image to the LLM and return raw text response."""
    result = client.vision_complete(
        image_bytes=image_bytes,
        media_type=media_type,
        system_prompt=EXTRACTION_SYSTEM_PROMPT,
        user_prompt=(
            "Output ONLY the JSON object. No thinking, no explanation, no markdown. "
            "Start your response with '{' and end with '}'."
        ),
        max_tokens=8192,
    )
    if not result:
        raise ValueError(
            "The vision model returned an empty response. "
            "The model may not support image inputs, or the image was rejected. "
            "Try a different OPENROUTER_MODEL in your .env file."
        )
    return result


def _call_repair_llm(
    client: BaseLLMClient, bad_response: str, error: str
) -> str:
    """Ask the LLM to fix its own malformed JSON."""
    repair_message = REPAIR_PROMPT_TEMPLATE.format(
        error=error, bad_response=bad_response
    )
    return client.text_complete(
        system_prompt="You are a JSON repair assistant. Output only valid JSON.",
        messages=[{"role": "user", "content": repair_message}],
        max_tokens=8192,
    )


def _parse_and_validate(raw: str) -> GraphData:
    """
    Parse raw LLM output into a validated GraphData.
    Handles:
    - Markdown fences (```json ... ```)
    - Reasoning model <think>...</think> blocks
    - Chain-of-thought prose before/after the JSON object
    """
    if not raw:
        raise ValueError("LLM returned empty or null response — cannot parse.")

    # 1. Strip <think>...</think> blocks (reasoning models like Nemotron, QwQ, R1)
    cleaned = re.sub(r"<think>[\s\S]*?</think>", "", raw, flags=re.IGNORECASE).strip()

    # 2. Strip markdown fences
    cleaned = re.sub(r"^```(?:json)?\s*\n?", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\n?```\s*$", "", cleaned.strip())

    # 3. Try to find the outermost JSON object anywhere in the response
    #    (handles models that output prose before/after the JSON)
    brace_start = cleaned.find("{")
    brace_end = cleaned.rfind("}")
    if brace_start != -1 and brace_end > brace_start:
        cleaned = cleaned[brace_start : brace_end + 1]

    data: dict[str, Any] = json.loads(cleaned)

    raw_nodes: list[dict] = data.get("nodes", [])
    raw_edges: list[dict] = data.get("edges", [])

    # Build and deduplicate nodes
    seen_ids: set[str] = set()
    nodes: list[GraphNode] = []
    for rn in raw_nodes:
        node_id = str(rn.get("id", "")).strip()
        if not node_id or node_id in seen_ids:
            continue
        seen_ids.add(node_id)
        nodes.append(
            GraphNode(
                id=node_id,
                label=str(rn.get("label", node_id)).strip(),
                type=str(rn.get("type", "unknown")).strip(),
                attributes=rn.get("attributes") or {},
            )
        )

    # Build edges — skip any with invalid node references
    edges: list[GraphEdge] = []
    for re_ in raw_edges:
        src = str(re_.get("source_id", "")).strip()
        tgt = str(re_.get("target_id", "")).strip()
        rel = str(re_.get("relationship", "RELATED_TO")).strip().upper()
        if src in seen_ids and tgt in seen_ids and src != tgt:
            edges.append(
                GraphEdge(
                    source_id=src,
                    target_id=tgt,
                    relationship=rel,
                    attributes=re_.get("attributes") or {},
                )
            )

    return GraphData(nodes=nodes, edges=edges)


def _get_media_type(path: Path) -> str:
    ext = path.suffix.lower()
    return {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".gif": "image/gif",
    }.get(ext, "image/jpeg")

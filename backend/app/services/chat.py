"""
Chat service — retrieval-augmented Q&A over a diagram's knowledge graph.

Pipeline for each question:
  1. Extract keywords from the user's question.
  2. Find matching entity IDs in Neo4j (fuzzy label match).
  3. Pull their 2-hop neighborhood as context.
  4. Serialize the subgraph to a compact text representation.
  5. Build a message list (includes recent history for follow-ups).
  6. Call Claude with a strict "answer from graph only" system prompt.
  7. Return the answer + source node references.

Chat history is stored in-memory per diagram_id.
It resets on server restart (acceptable for local dev).
"""
from __future__ import annotations

import logging
import re
from collections import defaultdict

from app.config import settings
from app.models.diagram import ChatResponse, GraphData, GraphNode, SourceReference
from app.services.graph_store import Neo4jStore
from app.services.llm_client import get_text_llm_client

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Prompt
# ---------------------------------------------------------------------------

ANSWER_SYSTEM_PROMPT = """\
You are a precise knowledge-graph Q&A assistant for diagram analysis.

You are given a subgraph extracted from a user-uploaded diagram as your \
ONLY source of truth. The subgraph lists entities (nodes) and their \
relationships (edges).

Rules:
1. Answer the user's question using ONLY the information in the provided \
   knowledge graph context.
2. If the answer is not present in the graph, say clearly: \
   "I couldn't find that information in the diagram's knowledge graph."
3. Be concise and direct. Reference entity names from the graph when answering.
4. Do not infer, guess, or use outside knowledge — only the graph.
5. If multiple entities are relevant, mention all of them.
6. For follow-up questions, use previous conversation turns for context, \
   but still ground answers only in the graph.\
"""


# ---------------------------------------------------------------------------
# Stopword list for keyword extraction
# ---------------------------------------------------------------------------

_STOPWORDS = frozenset({
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "what", "where", "when",
    "who", "which", "how", "why", "of", "in", "on", "at", "to", "for",
    "with", "by", "from", "about", "into", "through", "during", "and",
    "or", "but", "not", "this", "that", "these", "those", "it", "its",
    "tell", "me", "show", "give", "list", "find", "get", "what", "does",
    "diagram", "graph", "node", "entity", "relationship", "between",
})


# ---------------------------------------------------------------------------
# ChatService
# ---------------------------------------------------------------------------


class ChatService:
    """
    Manages per-diagram in-memory chat history and orchestrates the
    retrieval + LLM answer pipeline.
    """

    def __init__(self) -> None:
        # { diagram_id: [ {"role": "user"|"assistant", "content": str}, ... ] }
        self._history: defaultdict[str, list[dict]] = defaultdict(list)

    def get_history(self, diagram_id: str) -> list[dict]:
        return list(self._history[diagram_id])

    def clear_history(self, diagram_id: str) -> None:
        self._history[diagram_id] = []

    def answer_question(
        self, diagram_id: str, question: str, neo4j_store: Neo4jStore
    ) -> ChatResponse:
        """
        Full retrieval + answer pipeline.

        Args:
            diagram_id: The diagram to query.
            question:   The user's natural-language question.
            neo4j_store: Live Neo4j store instance.

        Returns:
            ChatResponse with answer text and source references.
        """
        # Step 1 — keyword extraction
        keywords = _extract_keywords(question)
        logger.info(f"[{diagram_id}] Keywords: {keywords}")

        # Step 2 — entity matching
        matched_ids = neo4j_store.find_entities_by_keywords(diagram_id, keywords)
        logger.info(f"[{diagram_id}] Matched entity IDs: {matched_ids}")

        # Step 3 — subgraph retrieval (2-hop neighborhood)
        subgraph = neo4j_store.get_subgraph_for_entities(
            diagram_id, matched_ids, hops=2
        )
        logger.info(
            f"[{diagram_id}] Subgraph: {len(subgraph.nodes)} nodes, "
            f"{len(subgraph.edges)} edges"
        )

        # Step 4 — build context text
        context_text = _subgraph_to_text(subgraph)

        # Step 5 — build message list (inject context into latest user turn)
        messages = _build_messages(
            history=self._history[diagram_id],
            context_text=context_text,
            question=question,
        )

        # Step 6 — LLM call (uses Groq for fast text responses)
        client = get_text_llm_client()
        answer = client.text_complete(
            system_prompt=ANSWER_SYSTEM_PROMPT,
            messages=messages,
            max_tokens=1024,
        )

        # Step 7 — persist to history
        self._history[diagram_id].append({"role": "user", "content": question})
        self._history[diagram_id].append({"role": "assistant", "content": answer})

        # Build source references from retrieved nodes
        sources = [
            SourceReference(type="node", id=n.id, label=n.label, detail=n.type)
            for n in subgraph.nodes[:12]  # cap for readability
        ]

        return ChatResponse(answer=answer, sources=sources, question=question)


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------


def _extract_keywords(text: str) -> list[str]:
    """
    Tokenize the question, strip stopwords, and return meaningful terms
    for fuzzy entity matching.
    """
    tokens = re.findall(r"[a-zA-Z][a-zA-Z0-9_\-]*", text.lower())
    return [t for t in tokens if t not in _STOPWORDS and len(t) > 2]


def _subgraph_to_text(graph: GraphData) -> str:
    """
    Convert a subgraph to a compact, readable text block for LLM context.

    Format:
        === KNOWLEDGE GRAPH CONTEXT ===

        ENTITIES:
          - Label (type: Type) [+ key=val attrs]

        RELATIONSHIPS:
          - Source --[RELATIONSHIP]--> Target
    """
    if not graph.nodes:
        return (
            "=== KNOWLEDGE GRAPH CONTEXT ===\n\n"
            "No relevant entities were found in the knowledge graph for this question.\n"
        )

    node_by_id: dict[str, GraphNode] = {n.id: n for n in graph.nodes}

    lines = ["=== KNOWLEDGE GRAPH CONTEXT ===", "", "ENTITIES:"]
    for node in graph.nodes:
        attr_str = ""
        if node.attributes:
            pairs = [f"{k}={v}" for k, v in list(node.attributes.items())[:4]]
            attr_str = "  |  " + ", ".join(pairs)
        lines.append(f"  - {node.label} (type: {node.type}){attr_str}")

    lines += ["", "RELATIONSHIPS:"]
    for edge in graph.edges:
        src_label = (
            node_by_id[edge.source_id].label
            if edge.source_id in node_by_id
            else edge.source_id
        )
        tgt_label = (
            node_by_id[edge.target_id].label
            if edge.target_id in node_by_id
            else edge.target_id
        )
        lines.append(f"  - {src_label} --[{edge.relationship}]--> {tgt_label}")

    lines.append("")
    return "\n".join(lines)


def _build_messages(
    history: list[dict], context_text: str, question: str
) -> list[dict]:
    """
    Build the Claude message list for a chat turn.

    We inject the graph context directly into the user's latest message so
    Claude sees: [history...] → user: <context> + <question>.
    We include the last 6 history messages (3 turns) to support follow-ups.
    """
    messages: list[dict] = []

    # Include the last few turns for follow-up question support
    recent_history = history[-6:] if len(history) > 6 else history
    messages.extend(recent_history)

    # Inject graph context + question as the current user turn
    messages.append(
        {
            "role": "user",
            "content": f"{context_text}\n\nUSER QUESTION: {question}",
        }
    )
    return messages

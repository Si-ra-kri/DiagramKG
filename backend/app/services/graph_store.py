"""
Neo4j graph store — all knowledge graph read/write operations.

Design decisions:
- All nodes use a single label :Entity to keep the schema generic (the node
  'type' is stored as a property, not a Neo4j label, so any diagram domain works).
- All edges use a single relationship type :RELATED_TO with a 'relationship'
  property for the semantic label (e.g. "CONTAINS", "PRODUCES").
- Every node and edge is tagged with diagram_id so multiple uploads never mix.
- Node attributes are stored as a JSON string (Neo4j 5 supports maps natively,
  but JSON strings are simpler to handle across driver versions).
"""
from __future__ import annotations

import json
import logging
from typing import Optional

from neo4j import GraphDatabase

from app.models.diagram import GraphData, GraphEdge, GraphNode

logger = logging.getLogger(__name__)


class Neo4jStore:
    def __init__(self, uri: str, user: str, password: str):
        self._driver = GraphDatabase.driver(uri, auth=(user, password))

    def close(self) -> None:
        self._driver.close()

    # ------------------------------------------------------------------
    # Connectivity
    # ------------------------------------------------------------------

    def verify_connectivity(self) -> bool:
        """Return True if Neo4j is reachable, False otherwise (never raises)."""
        try:
            self._driver.verify_connectivity()
            return True
        except Exception as exc:
            logger.warning(f"Neo4j connectivity check failed: {exc}")
            return False

    def ensure_indexes(self) -> None:
        """Create indexes for fast lookups. Safe to call repeatedly."""
        with self._driver.session() as session:
            session.run(
                "CREATE INDEX entity_diagram_id IF NOT EXISTS "
                "FOR (n:Entity) ON (n.diagram_id)"
            )
            session.run(
                "CREATE INDEX entity_id_diagram IF NOT EXISTS "
                "FOR (n:Entity) ON (n.id, n.diagram_id)"
            )

    # ------------------------------------------------------------------
    # Write
    # ------------------------------------------------------------------

    def write_graph(self, diagram_id: str, graph_data: GraphData) -> None:
        """
        Persist extracted nodes and edges for a diagram.
        Uses MERGE so re-running for the same diagram_id is idempotent.
        """
        with self._driver.session() as session:
            # Write all nodes
            for node in graph_data.nodes:
                session.run(
                    """
                    MERGE (n:Entity {id: $id, diagram_id: $diagram_id})
                    SET n.label      = $label,
                        n.type       = $type,
                        n.attributes = $attributes
                    """,
                    id=node.id,
                    diagram_id=diagram_id,
                    label=node.label,
                    type=node.type,
                    attributes=json.dumps(node.attributes),
                )

            # Write all edges (only after all nodes exist)
            for edge in graph_data.edges:
                session.run(
                    """
                    MATCH (a:Entity {id: $source_id, diagram_id: $diagram_id})
                    MATCH (b:Entity {id: $target_id, diagram_id: $diagram_id})
                    MERGE (a)-[r:RELATED_TO {diagram_id: $diagram_id,
                                              source_id: $source_id,
                                              target_id: $target_id}]->(b)
                    SET r.relationship = $relationship,
                        r.attributes   = $attributes
                    """,
                    source_id=edge.source_id,
                    target_id=edge.target_id,
                    diagram_id=diagram_id,
                    relationship=edge.relationship,
                    attributes=json.dumps(edge.attributes),
                )

        logger.info(
            f"[{diagram_id}] Wrote {len(graph_data.nodes)} nodes, "
            f"{len(graph_data.edges)} edges"
        )

    # ------------------------------------------------------------------
    # Read — full graph
    # ------------------------------------------------------------------

    def get_graph(self, diagram_id: str) -> GraphData:
        """Return the complete knowledge graph for a diagram."""
        with self._driver.session() as session:
            node_records = session.run(
                "MATCH (n:Entity {diagram_id: $diagram_id}) RETURN n",
                diagram_id=diagram_id,
            ).data()

            edge_records = session.run(
                """
                MATCH (a:Entity {diagram_id: $diagram_id})-[r:RELATED_TO]->(b:Entity)
                RETURN a.id            AS source_id,
                       b.id            AS target_id,
                       r.relationship  AS relationship,
                       r.attributes    AS attributes
                """,
                diagram_id=diagram_id,
            ).data()

        return GraphData(
            nodes=[_row_to_node(r["n"]) for r in node_records],
            edges=[_row_to_edge(r) for r in edge_records],
        )

    # ------------------------------------------------------------------
    # Read — subgraph retrieval for chat
    # ------------------------------------------------------------------

    def find_entities_by_keywords(
        self, diagram_id: str, keywords: list[str]
    ) -> list[str]:
        """
        Return entity IDs whose labels contain any of the given keywords
        (case-insensitive substring match). Used as the first step of chat retrieval.
        Uses parameterized Cypher to avoid injection.
        """
        if not keywords:
            return []
        with self._driver.session() as session:
            result = session.run(
                """
                MATCH (n:Entity {diagram_id: $diagram_id})
                WHERE any(kw IN $keywords WHERE toLower(n.label) CONTAINS toLower(kw))
                RETURN n.id AS id
                """,
                diagram_id=diagram_id,
                keywords=keywords,
            ).data()
        return [r["id"] for r in result]

    def get_subgraph_for_entities(
        self,
        diagram_id: str,
        entity_ids: list[str],
        hops: int = 2,
    ) -> GraphData:
        """
        Pull the N-hop neighborhood around the given seed entity IDs.
        Falls back to a sample of the full graph if no seeds are found.
        """
        if not entity_ids:
            logger.debug("No seed entities found; returning sample graph")
            return self._get_sample_graph(diagram_id)

        with self._driver.session() as session:
            # Collect all nodes within N hops of any seed
            node_records = session.run(
                f"""
                MATCH (seed:Entity {{diagram_id: $diagram_id}})
                WHERE seed.id IN $entity_ids
                MATCH (seed)-[*0..{hops}]-(neighbor:Entity {{diagram_id: $diagram_id}})
                RETURN DISTINCT neighbor AS n
                LIMIT 80
                """,
                diagram_id=diagram_id,
                entity_ids=entity_ids,
            ).data()

            neighbor_ids = [r["n"]["id"] for r in node_records]

            # Collect edges that are fully within the neighborhood
            edge_records = session.run(
                """
                MATCH (a:Entity {diagram_id: $diagram_id})-[r:RELATED_TO]->
                      (b:Entity {diagram_id: $diagram_id})
                WHERE a.id IN $ids AND b.id IN $ids
                RETURN a.id           AS source_id,
                       b.id           AS target_id,
                       r.relationship AS relationship,
                       r.attributes   AS attributes
                """,
                diagram_id=diagram_id,
                ids=neighbor_ids,
            ).data()

        return GraphData(
            nodes=[_row_to_node(r["n"]) for r in node_records],
            edges=[_row_to_edge(r) for r in edge_records],
        )

    def _get_sample_graph(self, diagram_id: str, limit: int = 60) -> GraphData:
        """Return a sample of the graph when no seed entities match."""
        with self._driver.session() as session:
            node_records = session.run(
                "MATCH (n:Entity {diagram_id: $diagram_id}) RETURN n LIMIT $limit",
                diagram_id=diagram_id,
                limit=limit,
            ).data()
            node_ids = [r["n"]["id"] for r in node_records]
            edge_records = session.run(
                """
                MATCH (a:Entity {diagram_id: $diagram_id})-[r:RELATED_TO]->
                      (b:Entity {diagram_id: $diagram_id})
                WHERE a.id IN $ids AND b.id IN $ids
                RETURN a.id AS source_id, b.id AS target_id,
                       r.relationship AS relationship, r.attributes AS attributes
                LIMIT 120
                """,
                diagram_id=diagram_id,
                ids=node_ids,
            ).data()
        return GraphData(
            nodes=[_row_to_node(r["n"]) for r in node_records],
            edges=[_row_to_edge(r) for r in edge_records],
        )

    # ------------------------------------------------------------------
    # Delete
    # ------------------------------------------------------------------

    def delete_diagram_graph(self, diagram_id: str) -> int:
        """Delete all nodes and relationships for a diagram. Returns deleted count."""
        with self._driver.session() as session:
            result = session.run(
                """
                MATCH (n:Entity {diagram_id: $diagram_id})
                DETACH DELETE n
                RETURN count(n) AS deleted
                """,
                diagram_id=diagram_id,
            ).single()
        deleted = result["deleted"] if result else 0
        logger.info(f"[{diagram_id}] Deleted {deleted} nodes from Neo4j")
        return deleted


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------


def _parse_attrs(raw: Optional[str]) -> dict:
    """Safely parse a JSON-string attribute back to a dict."""
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except Exception:
        return {}


def _row_to_node(props: dict) -> GraphNode:
    return GraphNode(
        id=props["id"],
        label=props.get("label", props["id"]),
        type=props.get("type", "unknown"),
        attributes=_parse_attrs(props.get("attributes")),
    )


def _row_to_edge(row: dict) -> GraphEdge:
    return GraphEdge(
        source_id=row["source_id"],
        target_id=row["target_id"],
        relationship=row.get("relationship", "RELATED_TO"),
        attributes=_parse_attrs(row.get("attributes")),
    )

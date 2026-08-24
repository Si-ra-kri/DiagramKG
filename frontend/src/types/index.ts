// Canonical TypeScript types for the DiagramKG frontend.
// These mirror the Pydantic models in backend/app/models/diagram.py.

export type DiagramStatus = 'processing' | 'ready' | 'failed';

export interface DiagramOut {
  id: string;
  filename: string;
  original_filename: string;
  status: DiagramStatus;
  entity_count: number;
  relationship_count: number;
  created_at: string;
  thumbnail_url: string | null;
  error_message: string | null;
}

export interface GraphNode {
  id: string;
  label: string;
  type: string;
  attributes: Record<string, unknown>;
}

export interface GraphEdge {
  source_id: string;
  target_id: string;
  relationship: string;
  attributes: Record<string, unknown>;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface SourceReference {
  type: 'node' | 'edge';
  id: string;
  label: string;
  detail: string | null;
}

export interface ChatMessage {
  id: string;           // client-side UUID for React keys
  role: 'user' | 'assistant';
  content: string;
  sources?: SourceReference[];
  timestamp: Date;
  isLoading?: boolean;  // true while awaiting LLM response
}

export interface ToastItem {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
}

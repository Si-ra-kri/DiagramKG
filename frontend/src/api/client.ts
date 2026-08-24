/**
 * Typed fetch wrappers for the DiagramKG backend API.
 * All functions throw ApiError on non-2xx responses.
 */
import type { DiagramOut, GraphData, SourceReference } from '../types';

// Empty string = use Vite dev proxy (configured in vite.config.ts).
// For production builds, set VITE_API_BASE_URL env var.
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const resp = await fetch(`${BASE_URL}${path}`, {
    headers:
      options?.body instanceof FormData
        ? (options.headers ?? {})
        : { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
    ...options,
  });

  if (resp.status === 204) return undefined as T;

  if (!resp.ok) {
    let detail = `HTTP ${resp.status}`;
    try {
      const body = await resp.json();
      detail = body.detail ?? detail;
    } catch {
      /* ignore parse errors */
    }
    throw new ApiError(detail, resp.status);
  }
  return resp.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Upload (uses XMLHttpRequest for upload progress events)
// ---------------------------------------------------------------------------

export function uploadDiagram(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<DiagramOut> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE_URL}/api/diagrams`); // BASE_URL is '' in dev (proxy handles it)

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText) as DiagramOut);
      } else {
        let detail = `HTTP ${xhr.status}`;
        try {
          detail = JSON.parse(xhr.responseText).detail ?? detail;
        } catch {
          /* ignore */
        }
        reject(new ApiError(detail, xhr.status));
      }
    };

    xhr.onerror = () => reject(new ApiError('Network error — is the backend running?', 0));
    xhr.send(formData);
  });
}

// ---------------------------------------------------------------------------
// Diagram endpoints
// ---------------------------------------------------------------------------

export const getDiagram = (id: string): Promise<DiagramOut> =>
  request<DiagramOut>(`/api/diagrams/${id}`);

export const listDiagrams = (): Promise<DiagramOut[]> =>
  request<DiagramOut[]>('/api/diagrams');

export const getDiagramGraph = (id: string): Promise<GraphData> =>
  request<GraphData>(`/api/diagrams/${id}/graph`);

export const deleteDiagram = (id: string): Promise<void> =>
  request<void>(`/api/diagrams/${id}`, { method: 'DELETE' });

// ---------------------------------------------------------------------------
// Chat endpoint
// ---------------------------------------------------------------------------

export interface ChatApiResponse {
  answer: string;
  sources: SourceReference[];
  question: string;
}

export const chatWithDiagram = (
  id: string,
  question: string,
): Promise<ChatApiResponse> =>
  request<ChatApiResponse>(`/api/diagrams/${id}/chat`, {
    method: 'POST',
    body: JSON.stringify({ question }),
  });

import { useState } from 'react';
import type { DiagramOut } from '../types';
import { StatusBadge } from './StatusBadge';
import { deleteDiagram } from '../api/client';

interface DiagramListProps {
  diagrams: DiagramOut[];
  activeDiagramId: string | null;
  onSelect: (diagram: DiagramOut) => void;
  onDelete: (id: string) => void;
  addToast: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function DiagramList({
  diagrams,
  activeDiagramId,
  onSelect,
  onDelete,
  addToast,
}: DiagramListProps) {
  const [deleting, setDeleting] = useState<string | null>(null);

  if (diagrams.length === 0) {
    return (
      <div className="text-center py-6 text-slate-500 text-xs">
        No diagrams yet — upload one above
      </div>
    );
  }

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDeleting(id);
    try {
      await deleteDiagram(id);
      onDelete(id);
      addToast('Diagram deleted', 'info');
    } catch {
      addToast('Failed to delete diagram', 'error');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      {diagrams.map((d) => {
        const isActive = d.id === activeDiagramId;
        return (
          <button
            key={d.id}
            onClick={() => onSelect(d)}
            className={`
              w-full flex items-center gap-3 p-3 rounded-xl text-left
              border transition-all duration-200 group
              ${isActive
                ? 'border-indigo-500/50 bg-indigo-500/10'
                : 'border-slate-700/50 hover:border-slate-600 hover:bg-slate-800/50'
              }
            `}
          >
            {/* Thumbnail or placeholder */}
            {d.thumbnail_url ? (
              <img
                src={d.thumbnail_url}
                alt={d.original_filename}
                className="w-10 h-10 rounded-lg object-cover shrink-0 border border-slate-700"
              />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-slate-700 shrink-0 flex items-center justify-center">
                <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 21h18M3 3h18" />
                </svg>
              </div>
            )}

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-200 truncate">
                {d.original_filename}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <StatusBadge status={d.status} size="sm" />
                {d.status === 'ready' && (
                  <span className="text-xs text-slate-500">
                    {d.entity_count}N · {d.relationship_count}E
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 mt-0.5">{formatDate(d.created_at)}</p>
            </div>

            {/* Delete button */}
            <button
              onClick={(e) => handleDelete(e, d.id)}
              disabled={deleting === d.id}
              className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity
                p-1.5 rounded-lg hover:bg-red-500/10 text-slate-500 hover:text-red-400"
              title="Delete diagram"
            >
              {deleting === d.id ? (
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
              )}
            </button>
          </button>
        );
      })}
    </div>
  );
}

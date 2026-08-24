import type { DiagramOut } from '../types';
import { StatusBadge } from './StatusBadge';

interface DiagramPreviewProps {
  diagram: DiagramOut;
}

export function DiagramPreview({ diagram }: DiagramPreviewProps) {
  const isReady = diagram.status === 'ready';
  const isProcessing = diagram.status === 'processing';

  return (
    <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 overflow-hidden">
      {/* Image */}
      <div className="relative bg-slate-900/50 flex items-center justify-center min-h-40 max-h-56 overflow-hidden">
        {diagram.thumbnail_url ? (
          <img
            src={diagram.thumbnail_url}
            alt={diagram.original_filename}
            className="max-h-56 max-w-full object-contain"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-slate-600 py-8">
            <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 21h18M3 3h18" />
            </svg>
            <span className="text-xs">No preview</span>
          </div>
        )}

        {/* Processing overlay */}
        {isProcessing && (
          <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
            <svg className="w-8 h-8 text-indigo-400 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            <p className="text-sm text-indigo-300 font-medium">Extracting knowledge graph…</p>
            <p className="text-xs text-slate-400">This may take 10–30 seconds</p>
          </div>
        )}
      </div>

      {/* Metadata */}
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-slate-200 truncate flex-1">
            {diagram.original_filename}
          </p>
          <StatusBadge status={diagram.status} size="sm" />
        </div>

        {/* Extraction stats */}
        {isReady && (
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-indigo-500/10 border border-indigo-500/20 p-3 text-center">
              <div className="text-2xl font-bold text-indigo-300">{diagram.entity_count}</div>
              <div className="text-xs text-slate-400 mt-0.5">Entities</div>
            </div>
            <div className="rounded-xl bg-violet-500/10 border border-violet-500/20 p-3 text-center">
              <div className="text-2xl font-bold text-violet-300">{diagram.relationship_count}</div>
              <div className="text-xs text-slate-400 mt-0.5">Relationships</div>
            </div>
          </div>
        )}

        {/* Error */}
        {diagram.status === 'failed' && diagram.error_message && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3">
            <p className="text-xs text-red-300 font-medium mb-1">Extraction failed</p>
            <p className="text-xs text-slate-400 break-words">{diagram.error_message}</p>
          </div>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import type { DiagramOut, GraphData } from '../types';
import { UploadZone } from './UploadZone';
import { DiagramPreview } from './DiagramPreview';
import { DiagramList } from './DiagramList';
import { GraphVisualization } from './GraphVisualization';
import { uploadDiagram, getDiagramGraph } from '../api/client';

interface DiagramPanelProps {
  activeDiagram: DiagramOut | null;
  diagrams: DiagramOut[];
  onDiagramUploaded: (diagram: DiagramOut) => void;
  onSelectDiagram: (diagram: DiagramOut) => void;
  onDeleteDiagram: (id: string) => void;
  onDiagramsChanged: () => void;
  addToast: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

export function DiagramPanel({
  activeDiagram,
  diagrams,
  onDiagramUploaded,
  onSelectDiagram,
  onDeleteDiagram,
  onDiagramsChanged,
  addToast,
}: DiagramPanelProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [showGraph, setShowGraph] = useState(false);

  // Load graph data when a ready diagram is selected
  useEffect(() => {
    setGraphData(null);
    setShowGraph(false);
    if (activeDiagram?.status === 'ready') {
      getDiagramGraph(activeDiagram.id)
        .then(setGraphData)
        .catch(() => {/* non-fatal */});
    }
  }, [activeDiagram?.id, activeDiagram?.status]);

  const handleFileSelected = async (file: File) => {
    setIsUploading(true);
    setUploadProgress(0);
    try {
      const diagram = await uploadDiagram(file, setUploadProgress);
      onDiagramUploaded(diagram);
      if (diagram.status === 'ready') {
        addToast(
          `Graph extracted: ${diagram.entity_count} entities, ${diagram.relationship_count} relationships`,
          'success',
        );
      } else if (diagram.status === 'failed') {
        addToast('Extraction failed. Check error details.', 'error');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      addToast(msg, 'error');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      onDiagramsChanged();
    }
  };

  return (
    <aside className="flex-1 flex flex-col border-r border-slate-800 bg-[#0a1020] overflow-hidden">
      {/* Inner scrollable content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4">

        {/* Upload zone */}
        <section>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Upload Diagram
          </h2>
          <UploadZone
            onFileSelected={handleFileSelected}
            isUploading={isUploading}
            uploadProgress={uploadProgress}
          />
        </section>

        {/* Active diagram preview */}
        {activeDiagram && (
          <section>
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Current Diagram
            </h2>
            <DiagramPreview diagram={activeDiagram} />
          </section>
        )}

        {/* Graph visualization toggle */}
        {graphData && graphData.nodes.length > 0 && (
          <section>
            <button
              onClick={() => setShowGraph((v) => !v)}
              className="w-full flex items-center justify-between px-1 py-1 group"
            >
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider group-hover:text-slate-400 transition-colors">
                Graph Visualization
              </h2>
              <svg
                className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${showGraph ? 'rotate-180' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showGraph && <div className="mt-2"><GraphVisualization graphData={graphData} /></div>}
          </section>
        )}

        {/* Past diagrams */}
        {diagrams.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Past Diagrams
            </h2>
            <DiagramList
              diagrams={diagrams}
              activeDiagramId={activeDiagram?.id ?? null}
              onSelect={onSelectDiagram}
              onDelete={(id) => {
                onDeleteDiagram(id);
                onDiagramsChanged();
              }}
              addToast={addToast}
            />
          </section>
        )}
      </div>
    </aside>
  );
}

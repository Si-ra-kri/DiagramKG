import { useEffect, useRef, useState, useCallback } from 'react';
import type { GraphData } from '../types';

// react-force-graph-2d is a canvas-based library; types may be loose.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import ForceGraph2D from 'react-force-graph-2d';

interface GraphVisualizationProps {
  graphData: GraphData;
}

// ---------------------------------------------------------------------------
// Color palette for entity types (assigned by insertion order)
// ---------------------------------------------------------------------------
const PALETTE = [
  '#6366f1', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16',
  '#f97316', '#14b8a6',
];

function makeColorMap(graph: GraphData) {
  const map = new Map<string, string>();
  graph.nodes.forEach((n) => {
    if (!map.has(n.type)) {
      map.set(n.type, PALETTE[map.size % PALETTE.length]);
    }
  });
  return map;
}

// ---------------------------------------------------------------------------
// Transform GraphData → react-force-graph-2d data format
// ---------------------------------------------------------------------------
function toFGData(graph: GraphData) {
  return {
    nodes: graph.nodes.map((n) => ({ ...n, name: n.label })),
    links: graph.edges.map((e) => ({
      source: e.source_id,
      target: e.target_id,
      label: e.relationship,
    })),
  };
}

// ---------------------------------------------------------------------------
// Inner graph canvas (reused for both compact and fullscreen)
// ---------------------------------------------------------------------------
function GraphCanvas({
  graphData,
  width,
  height,
  colorMap,
}: {
  graphData: GraphData;
  width: number;
  height: number;
  colorMap: Map<string, string>;
}) {
  const fgData = toFGData(graphData);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  const paintNode = useCallback(
    (node: Record<string, unknown>, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const x = node.x as number;
      const y = node.y as number;
      const label = node.label as string;
      const type = node.type as string;
      const color = colorMap.get(type) ?? '#6366f1';
      const isHovered = node.id === hoveredNode;
      const radius = isHovered ? 8 : 5;

      if (isHovered) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 16;
      }

      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.shadowBlur = 0;

      if (globalScale >= 0.8) {
        const fontSize = Math.min(13, 11 / globalScale);
        ctx.font = `${fontSize}px Inter, sans-serif`;
        ctx.fillStyle = 'rgba(241,245,249,0.92)';
        ctx.textAlign = 'center';
        ctx.fillText(label, x, y + radius + fontSize);
      }
    },
    [hoveredNode, colorMap],
  );

  return (
    <ForceGraph2D
      graphData={fgData}
      width={width}
      height={height}
      backgroundColor="#060c18"
      linkColor={() => 'rgba(99,102,241,0.35)'}
      linkDirectionalArrowLength={5}
      linkDirectionalArrowRelPos={1}
      linkDirectionalParticles={1}
      linkDirectionalParticleColor={() => 'rgba(99,102,241,0.8)'}
      linkDirectionalParticleWidth={2}
      nodeCanvasObject={paintNode}
      nodePointerAreaPaint={(node: Record<string, unknown>, color: string, ctx: CanvasRenderingContext2D) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(node.x as number, node.y as number, 8, 0, 2 * Math.PI);
        ctx.fill();
      }}
      onNodeHover={(node: Record<string, unknown> | null) =>
        setHoveredNode(node ? (node.id as string) : null)
      }
      nodeLabel={(node: Record<string, unknown>) => `${node.label} (${node.type})`}
      linkLabel={(link: Record<string, unknown>) => link.label as string}
      cooldownTicks={120}
      d3AlphaDecay={0.015}
      d3VelocityDecay={0.3}
    />
  );
}

// ---------------------------------------------------------------------------
// Legend
// ---------------------------------------------------------------------------
function Legend({ colorMap }: { colorMap: Map<string, string> }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 px-1">
      {Array.from(colorMap.entries()).map(([type, color]) => (
        <div key={type} className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
          <span className="text-xs text-slate-400 capitalize">{type}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function GraphVisualization({ graphData }: GraphVisualizationProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(400);
  const [fullscreen, setFullscreen] = useState(false);
  const colorMap = makeColorMap(graphData);

  // Observe container width for compact view
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Lock body scroll when fullscreen
  useEffect(() => {
    document.body.style.overflow = fullscreen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [fullscreen]);

  if (graphData.nodes.length === 0) return null;

  return (
    <>
      {/* ---- Compact in-panel view ---- */}
      <div className="rounded-2xl border border-slate-700/50 bg-slate-900/60 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-700/50">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Knowledge Graph
          </span>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">
              {graphData.nodes.length} nodes · {graphData.edges.length} edges
            </span>
            {/* Expand button */}
            <button
              onClick={() => setFullscreen(true)}
              title="Open fullscreen"
              className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300
                px-2 py-0.5 rounded-lg hover:bg-indigo-500/10 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
              Expand
            </button>
          </div>
        </div>

        {/* Compact canvas */}
        <div ref={containerRef} style={{ height: 280 }}>
          <GraphCanvas
            graphData={graphData}
            width={width}
            height={280}
            colorMap={colorMap}
          />
        </div>

        {/* Legend */}
        <div className="px-4 py-2.5 border-t border-slate-700/30">
          <Legend colorMap={colorMap} />
        </div>
      </div>

      {/* ---- Fullscreen modal ---- */}
      {fullscreen && (
        <div
          className="fixed inset-0 z-50 bg-[#060c18]/95 backdrop-blur-sm flex flex-col"
          style={{ animation: 'fadeIn 0.15s ease' }}
        >
          {/* Modal header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-[#080d1a] shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
                <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M7.5 3.75H6A2.25 2.25 0 003.75 6v1.5M16.5 3.75H18A2.25 2.25 0 0120.25 6v1.5m0 9V18A2.25 2.25 0 0118 20.25h-1.5m-9 0H6A2.25 2.25 0 013.75 18v-1.5M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">Knowledge Graph</h2>
                <p className="text-xs text-slate-500">
                  {graphData.nodes.length} nodes · {graphData.edges.length} edges · Scroll to zoom · Drag to pan
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <Legend colorMap={colorMap} />
              <button
                onClick={() => setFullscreen(false)}
                className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white
                  px-3 py-1.5 rounded-lg hover:bg-slate-800 transition-colors border border-slate-700/50"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Close
              </button>
            </div>
          </div>

          {/* Full-viewport canvas */}
          <div className="flex-1 overflow-hidden">
            <GraphCanvas
              graphData={graphData}
              width={window.innerWidth}
              height={window.innerHeight - 73}
              colorMap={colorMap}
            />
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
      `}</style>
    </>
  );
}

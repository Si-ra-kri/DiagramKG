import { useCallback, useEffect, useState } from 'react';
import type { ChatMessage, DiagramOut, ToastItem } from './types';
import { DiagramPanel } from './components/DiagramPanel';
import { ChatPanel } from './components/ChatPanel';
import { Toast } from './components/Toast';
import { getDiagram, listDiagrams } from './api/client';

function makeToastId() {
  return Date.now() + Math.random();
}

export default function App() {
  const [diagrams, setDiagrams] = useState<DiagramOut[]>([]);
  const [activeDiagram, setActiveDiagram] = useState<DiagramOut | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // ---------------------------------------------------------------------------
  // Load diagram list
  // ---------------------------------------------------------------------------
  const loadDiagrams = useCallback(async () => {
    try {
      const list = await listDiagrams();
      setDiagrams(list);
    } catch {
      /* non-fatal — backend may not be running yet */
    }
  }, []);

  useEffect(() => {
    loadDiagrams();
  }, [loadDiagrams]);

  // ---------------------------------------------------------------------------
  // Poll for diagram status while processing
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!activeDiagram || activeDiagram.status !== 'processing') return;

    const interval = setInterval(async () => {
      try {
        const updated = await getDiagram(activeDiagram.id);
        setActiveDiagram(updated);
        // Update in the diagrams list too
        setDiagrams((prev) =>
          prev.map((d) => (d.id === updated.id ? updated : d)),
        );
        if (updated.status === 'ready') {
          addToast(
            `Graph ready: ${updated.entity_count} entities, ${updated.relationship_count} relationships`,
            'success',
          );
          clearInterval(interval);
        } else if (updated.status === 'failed') {
          addToast('Graph extraction failed. Check error details.', 'error');
          clearInterval(interval);
        }
      } catch {
        /* ignore transient errors */
      }
    }, 2500);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDiagram?.id, activeDiagram?.status]);

  // ---------------------------------------------------------------------------
  // Toasts
  // ---------------------------------------------------------------------------
  const addToast = useCallback(
    (message: string, type: ToastItem['type']) => {
      const id = makeToastId();
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(
        () => setToasts((prev) => prev.filter((t) => t.id !== id)),
        4500,
      );
    },
    [],
  );

  // ---------------------------------------------------------------------------
  // Diagram handlers
  // ---------------------------------------------------------------------------
  const handleDiagramUploaded = useCallback((diagram: DiagramOut) => {
    setActiveDiagram(diagram);
    setMessages([]);
  }, []);

  const handleSelectDiagram = useCallback((diagram: DiagramOut) => {
    setActiveDiagram(diagram);
    setMessages([]);
  }, []);

  const handleDeleteDiagram = useCallback((id: string) => {
    setDiagrams((prev) => prev.filter((d) => d.id !== id));
    if (activeDiagram?.id === id) {
      setActiveDiagram(null);
      setMessages([]);
    }
  }, [activeDiagram?.id]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="flex flex-col h-screen bg-[#080d1a] text-slate-100 overflow-hidden">
      {/* ---- Top navigation bar ---- */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-slate-800 bg-[#060c18] shrink-0">
        <div className="flex items-center gap-3">
          {/* Logo mark */}
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600
            flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M7.5 3.75H6A2.25 2.25 0 003.75 6v1.5M16.5 3.75H18A2.25 2.25 0 0120.25 6v1.5m0 9V18A2.25 2.25 0 0118 20.25h-1.5m-9 0H6A2.25 2.25 0 013.75 18v-1.5M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div>
            <h1 className="text-base font-bold text-white tracking-tight">DiagramKG</h1>
            <p className="text-xs text-slate-500 leading-none">
              Diagram → Knowledge Graph → Answers
            </p>
          </div>
        </div>

        {/* Status indicators */}
        <div className="flex items-center gap-4">
          {activeDiagram?.status === 'ready' && (
            <div className="hidden sm:flex items-center gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                {activeDiagram.entity_count} entities
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                {activeDiagram.relationship_count} relationships
              </span>
            </div>
          )}
          <a
            href="http://localhost:7474"
            target="_blank"
            rel="noreferrer"
            className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300
              transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-800/50"
            title="Open Neo4j Browser"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
            Neo4j Browser
          </a>
        </div>
      </header>

      {/* ---- Main content (split screen 50/50) ---- */}
      <div className="flex flex-1 overflow-hidden">
        <div className="w-1/2 flex flex-col border-r border-slate-800 overflow-hidden">
          <DiagramPanel
            activeDiagram={activeDiagram}
            diagrams={diagrams}
            onDiagramUploaded={handleDiagramUploaded}
            onSelectDiagram={handleSelectDiagram}
            onDeleteDiagram={handleDeleteDiagram}
            onDiagramsChanged={loadDiagrams}
            addToast={addToast}
          />
        </div>
        <div className="w-1/2 flex flex-col overflow-hidden">
          <ChatPanel
            activeDiagram={activeDiagram}
            messages={messages}
            setMessages={setMessages}
            addToast={addToast}
          />
        </div>
      </div>

      {/* ---- Toast stack ---- */}
      <div
        className="fixed bottom-5 right-5 flex flex-col gap-2 z-50"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <Toast key={t.id} toast={t} />
        ))}
      </div>
    </div>
  );
}

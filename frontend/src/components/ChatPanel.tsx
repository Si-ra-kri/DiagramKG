import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage, DiagramOut } from '../types';
import { ChatBubble } from './ChatBubble';
import { ChatInput } from './ChatInput';
import { chatWithDiagram } from '../api/client';
import { StatusBadge } from './StatusBadge';

interface ChatPanelProps {
  activeDiagram: DiagramOut | null;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  addToast: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

function makeId() {
  return Math.random().toString(36).slice(2);
}

/** Live elapsed-seconds counter, resets whenever key changes. */
function useElapsedSeconds(key: string | null | undefined) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    setSecs(0);
    if (!key) return;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [key]);
  return secs;
}

export function ChatPanel({ activeDiagram, messages, setMessages, addToast }: ChatPanelProps) {
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const elapsed = useElapsedSeconds(
    activeDiagram?.status === 'processing' ? activeDiagram.id : null
  );

  const isReady = activeDiagram?.status === 'ready';

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(
    async (question: string) => {
      if (!activeDiagram || !isReady) return;

      // Append user message
      const userMsg: ChatMessage = {
        id: makeId(),
        role: 'user',
        content: question,
        timestamp: new Date(),
      };
      // Append loading indicator
      const loadingMsg: ChatMessage = {
        id: makeId(),
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        isLoading: true,
      };
      setMessages((prev) => [...prev, userMsg, loadingMsg]);
      setIsLoading(true);

      try {
        const resp = await chatWithDiagram(activeDiagram.id, question);
        // Replace loading message with actual response
        const assistantMsg: ChatMessage = {
          id: loadingMsg.id,
          role: 'assistant',
          content: resp.answer,
          sources: resp.sources,
          timestamp: new Date(),
          isLoading: false,
        };
        setMessages((prev) =>
          prev.map((m) => (m.id === loadingMsg.id ? assistantMsg : m)),
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to get answer';
        addToast(msg, 'error');
        // Remove the loading bubble on error
        setMessages((prev) => prev.filter((m) => m.id !== loadingMsg.id));
      } finally {
        setIsLoading(false);
      }
    },
    [activeDiagram, isReady, setMessages, addToast],
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#080d1a]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-[#0a1020] shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30
            flex items-center justify-center">
            <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
            </svg>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-200">
              {activeDiagram ? activeDiagram.original_filename : 'Knowledge Graph Chat'}
            </h2>
            <p className="text-xs text-slate-500">
              {activeDiagram
                ? `${activeDiagram.entity_count} entities · ${activeDiagram.relationship_count} relationships`
                : 'Upload a diagram to begin'}
            </p>
          </div>
        </div>
        {activeDiagram && <StatusBadge status={activeDiagram.status} size="md" />}
      </div>

      {/* Message area */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-6 space-y-5">
        {/* Empty state */}
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center gap-4 text-center py-12">
            {!activeDiagram ? (
              <>
                <div className="w-16 h-16 rounded-2xl bg-slate-800/50 border border-slate-700/50
                  flex items-center justify-center">
                  <svg className="w-8 h-8 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                      d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                </div>
                <div>
                  <p className="text-base font-medium text-slate-400">No diagram loaded</p>
                  <p className="text-sm text-slate-600 mt-1">Upload a diagram on the left to start</p>
                </div>
              </>
            ) : activeDiagram.status === 'failed' ? (
              <>
                <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20
                  flex items-center justify-center">
                  <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                </div>
                <div>
                  <p className="text-base font-medium text-red-400">Extraction failed</p>
                  <p className="text-sm text-slate-500 mt-1 max-w-xs">
                    {activeDiagram.error_message
                      ? activeDiagram.error_message.slice(0, 180)
                      : 'Check the error details in the left panel and try uploading again.'}
                  </p>
                </div>
              </>
            ) : activeDiagram.status === 'processing' ? (
              <>
                {/* Spinner */}
                <div className="relative w-16 h-16">
                  <div className="absolute inset-0 rounded-2xl bg-amber-500/10 border border-amber-500/20" />
                  <svg className="absolute inset-0 w-full h-full animate-spin" viewBox="0 0 64 64" fill="none">
                    <circle cx="32" cy="32" r="28" stroke="rgba(245,158,11,0.15)" strokeWidth="4" />
                    <path d="M32 4 a28 28 0 0 1 28 28" stroke="#f59e0b" strokeWidth="4" strokeLinecap="round" />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-mono text-amber-400">
                    {elapsed}s
                  </span>
                </div>
                <div>
                  <p className="text-base font-medium text-slate-300">Extracting knowledge graph…</p>
                  <p className="text-xs text-slate-500 mt-1">Free-tier vision models take 30–90 s</p>
                </div>
                {/* Progress steps */}
                <div className="flex flex-col gap-1.5 text-xs text-slate-500 mt-1 text-left w-56">
                  {[
                    { label: 'Encoding image', done: elapsed >= 1 },
                    { label: 'Running vision model', done: elapsed >= 5 },
                    { label: 'Parsing JSON output', done: elapsed >= 60 },
                    { label: 'Writing to Neo4j', done: elapsed >= 70 },
                  ].map(({ label, done }) => (
                    <div key={label} className="flex items-center gap-2">
                      <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 ${
                        done ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-600'
                      }`}>
                        {done ? '✓' : '·'}
                      </span>
                      <span className={done ? 'text-slate-400' : ''}>{label}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                {/* Ready — show starter prompts */}
                <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20
                  flex items-center justify-center">
                  <svg className="w-8 h-8 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                      d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                </div>
                <div>
                  <p className="text-base font-medium text-slate-300">Graph ready — ask anything!</p>
                  <p className="text-sm text-slate-500 mt-1">Try one of these:</p>
                </div>
                <div className="grid grid-cols-1 gap-2 w-full max-w-md">
                  {[
                    'What are the main entities in this diagram?',
                    'What relationships exist between the components?',
                    'Summarize the overall structure',
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => handleSend(suggestion)}
                      disabled={isLoading}
                      className="text-left px-4 py-2.5 rounded-xl bg-slate-800/60 border border-slate-700/50
                        hover:border-indigo-500/40 hover:bg-indigo-500/5 transition-all duration-200
                        text-sm text-slate-400 hover:text-slate-300"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Messages */}
        {messages.map((m) => (
          <ChatBubble key={m.id} message={m} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <ChatInput
        onSend={handleSend}
        isDisabled={!isReady}
        isLoading={isLoading}
      />
    </div>
  );
}

import { useState } from 'react';
import type { ChatMessage } from '../types';

interface ChatBubbleProps {
  message: ChatMessage;
}

export function ChatBubble({ message }: ChatBubbleProps) {
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const isUser = message.role === 'user';

  if (message.isLoading) {
    return (
      <div className="flex gap-3 animate-fade-in">
        {/* Assistant avatar */}
        <div className="w-7 h-7 rounded-full bg-indigo-600/30 border border-indigo-500/30
          flex items-center justify-center shrink-0 mt-0.5">
          <span className="text-xs text-indigo-300 font-bold">K</span>
        </div>
        <div className="rounded-2xl rounded-tl-sm px-4 py-3 bg-slate-800/80 border border-slate-700/50">
          <div className="flex gap-1.5 items-center h-4">
            <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce [animation-delay:-0.3s]" />
            <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce [animation-delay:-0.15s]" />
            <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex gap-3 animate-slide-up ${isUser ? 'flex-row-reverse' : ''}`}
    >
      {/* Avatar */}
      {isUser ? (
        <div className="w-7 h-7 rounded-full bg-slate-700 border border-slate-600
          flex items-center justify-center shrink-0 mt-0.5">
          <svg className="w-3.5 h-3.5 text-slate-400" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
          </svg>
        </div>
      ) : (
        <div className="w-7 h-7 rounded-full bg-indigo-600/30 border border-indigo-500/30
          flex items-center justify-center shrink-0 mt-0.5">
          <span className="text-xs text-indigo-300 font-bold">K</span>
        </div>
      )}

      {/* Bubble */}
      <div className={`flex flex-col gap-1.5 max-w-[82%] ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className={`
            rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap
            ${isUser
              ? 'rounded-tr-sm bg-indigo-600 text-white'
              : 'rounded-tl-sm bg-slate-800/80 border border-slate-700/50 text-slate-200'
            }
          `}
        >
          {message.content}
        </div>

        {/* Sources accordion */}
        {!isUser && message.sources && message.sources.length > 0 && (
          <div className="w-full">
            <button
              onClick={() => setSourcesOpen((v) => !v)}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-400 transition-colors py-0.5"
            >
              <svg
                className={`w-3 h-3 transition-transform duration-150 ${sourcesOpen ? 'rotate-90' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
              </svg>
              {message.sources.length} source{message.sources.length !== 1 ? 's' : ''} used
            </button>

            {sourcesOpen && (
              <div className="mt-1 rounded-xl border border-slate-700/50 bg-slate-900/50 p-3 space-y-1.5 animate-fade-in">
                {message.sources.map((s, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                    <span className="text-xs text-slate-300">{s.label}</span>
                    {s.detail && (
                      <span className="text-xs text-slate-500 italic">({s.detail})</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

import { useRef, useState, useCallback, useEffect } from 'react';

interface ChatInputProps {
  onSend: (question: string) => void;
  isDisabled: boolean;
  isLoading: boolean;
  placeholder?: string;
}

export function ChatInput({ onSend, isDisabled, isLoading, placeholder }: ChatInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  const handleSend = useCallback(() => {
    const q = value.trim();
    if (!q || isDisabled || isLoading) return;
    onSend(q);
    setValue('');
    // Reset height
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }, [value, isDisabled, isLoading, onSend]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const defaultPlaceholder = isDisabled
    ? 'Upload and process a diagram to start chatting…'
    : 'Ask a question about the diagram… (Enter to send)';

  return (
    <div className="p-4 border-t border-slate-800 bg-[#0a1020]">
      <div className={`
        flex items-end gap-3 rounded-2xl border px-4 py-3 transition-all duration-200
        ${isDisabled
          ? 'border-slate-800 bg-slate-900/30 opacity-60'
          : 'border-slate-700/60 bg-slate-800/50 focus-within:border-indigo-500/60 focus-within:bg-slate-800/80'
        }
      `}>
        <textarea
          ref={textareaRef}
          id="chat-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={isDisabled || isLoading}
          placeholder={placeholder ?? defaultPlaceholder}
          rows={1}
          className="flex-1 bg-transparent resize-none outline-none text-sm text-slate-200
            placeholder:text-slate-600 disabled:cursor-not-allowed leading-relaxed"
        />

        <button
          id="chat-send-button"
          onClick={handleSend}
          disabled={isDisabled || isLoading || !value.trim()}
          className={`
            shrink-0 w-8 h-8 rounded-xl flex items-center justify-center
            transition-all duration-200
            ${!isDisabled && !isLoading && value.trim()
              ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
              : 'bg-slate-700 text-slate-500 cursor-not-allowed'
            }
          `}
          title="Send (Enter)"
        >
          {isLoading ? (
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
            </svg>
          )}
        </button>
      </div>
      <p className="text-xs text-slate-600 mt-2 px-1">
        Shift+Enter for new line · answers are grounded in the extracted knowledge graph
      </p>
    </div>
  );
}

import type { ToastItem } from '../types';

interface ToastProps {
  toast: ToastItem;
}

const ICONS: Record<ToastItem['type'], string> = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
  warning: '⚠',
};

const STYLES: Record<ToastItem['type'], string> = {
  success: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  error: 'border-red-500/40 bg-red-500/10 text-red-300',
  info: 'border-indigo-500/40 bg-indigo-500/10 text-indigo-300',
  warning: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
};

export function Toast({ toast }: ToastProps) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-sm
        shadow-2xl animate-slide-up min-w-72 max-w-sm ${STYLES[toast.type]}`}
    >
      <span className="text-base font-bold shrink-0">{ICONS[toast.type]}</span>
      <p className="text-sm font-medium">{toast.message}</p>
    </div>
  );
}

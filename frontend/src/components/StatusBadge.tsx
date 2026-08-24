import type { DiagramStatus } from '../types';

interface StatusBadgeProps {
  status: DiagramStatus;
  size?: 'sm' | 'md';
}

const CONFIG: Record<
  DiagramStatus,
  { label: string; dot: string; bg: string; text: string }
> = {
  processing: {
    label: 'Processing',
    dot: 'bg-amber-400 animate-pulse',
    bg: 'bg-amber-500/10 border-amber-500/30',
    text: 'text-amber-300',
  },
  ready: {
    label: 'Ready',
    dot: 'bg-emerald-400',
    bg: 'bg-emerald-500/10 border-emerald-500/30',
    text: 'text-emerald-300',
  },
  failed: {
    label: 'Failed',
    dot: 'bg-red-400',
    bg: 'bg-red-500/10 border-red-500/30',
    text: 'text-red-300',
  },
};

export function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
  const cfg = CONFIG[status];
  const padding = size === 'sm' ? 'px-2.5 py-0.5' : 'px-3 py-1';
  const font = size === 'sm' ? 'text-xs' : 'text-sm';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border ${padding} ${cfg.bg} ${cfg.text} ${font} font-medium`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

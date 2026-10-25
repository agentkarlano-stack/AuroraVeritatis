import { AlertTriangle, ArrowUpRight, Loader2 } from 'lucide-react';
import { Link } from 'react-router';
import type { ReactNode } from 'react';
import { PROVENANCE } from '../../shared/copy';
import type { Provenance } from '../../shared/types';
import { tier, useTier } from '../lib/entitlements';
import { Monogram } from './Logo';

const BADGE_CLASS: Record<Provenance, string> = {
  confirmed: 'border-up/50 text-up',
  estimate: 'border-info/50 text-info',
  unverified: 'border-warn/50 text-warn',
  simulated: 'border-gold-dim text-gold',
};

export function ProvenanceBadge({ kind, className = '' }: { kind: Provenance; className?: string }) {
  const p = { ...PROVENANCE[kind], cls: BADGE_CLASS[kind] };
  return (
    <span title={p.description} className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${p.cls} ${className}`}>
      {p.label}
    </span>
  );
}

export function DemoNotice({ children }: { children: ReactNode }) {
  return (
    <div role="note" className="flex items-start gap-2 rounded-lg border border-gold-dim/50 bg-gold/5 px-3 py-2 text-xs leading-relaxed text-gold-soft">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  );
}

export function Panel({ title, eyebrow, actions, children, className = '', bodyClass = 'p-4' }: {
  title?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClass?: string;
}) {
  return (
    <section className={`panel flex min-w-0 flex-col ${className}`}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            {eyebrow && <div className="eyebrow mb-0.5">{eyebrow}</div>}
            {title && <h2 className="truncate text-sm font-semibold text-platinum">{title}</h2>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
        </header>
      )}
      <div className={`min-h-0 flex-1 ${bodyClass}`}>{children}</div>
    </section>
  );
}

export function PageHeader({ eyebrow, title, children, actions }: { eyebrow: string; title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="max-w-3xl">
        <div className="eyebrow mb-2">{eyebrow}</div>
        <h1 className="text-2xl font-semibold text-platinum md:text-3xl">{title}</h1>
        {children && <p className="mt-2 text-sm leading-relaxed text-mist">{children}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-6 text-sm text-mist" role="status">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {label}…
    </div>
  );
}

/**
 * Route-level loading state: the AV monogram with a slow pulse and an indeterminate bar (no fake percentages). It only
 * appears after a short delay, so fast navigation shows nothing at all.
 */
export function AppLoading({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="av-load-delay flex min-h-[50vh] flex-col items-center justify-center gap-4" role="status" aria-live="polite">
      <Monogram className="av-load-mono h-10 w-auto" title="" />
      <div className="h-px w-28 overflow-hidden bg-line" aria-hidden>
        <div className="av-load-bar h-px w-1/3 bg-gold/80" />
      </div>
      <span className="text-xs text-slate-dim">{label}…</span>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-lg border border-down/40 bg-down/5 p-4 text-sm" role="alert">
      <div className="font-medium text-down">Data unavailable</div>
      <p className="mt-1 text-mist">{message}</p>
      {onRetry && (
        <button className="btn-ghost mt-3" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function Unavailable({ children, phase }: { children: ReactNode; phase?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-line px-4 py-3 text-sm text-slate-dim">
      {children}
      {phase && <span className="ml-1 text-xs text-gold-dim">({phase})</span>}
    </div>
  );
}

export function Sparkline({ values, width = 96, height = 28, className = '' }: { values: number[]; width?: number; height?: number; className?: string }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const d = values
    .map((v, i) => `${i ? 'L' : 'M'}${((i / (values.length - 1)) * width).toFixed(1)},${(height - ((v - min) / span) * (height - 2) - 1).toFixed(1)}`)
    .join('');
  const up = values.at(-1)! >= values[0]!;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden>
      <path d={d} fill="none" stroke={up ? 'var(--color-up)' : 'var(--color-down)'} strokeWidth="1.4" />
    </svg>
  );
}

export function Change({ value, className = '' }: { value: number | null; className?: string }) {
  if (value == null || !Number.isFinite(value)) return <span className={`text-slate-dim ${className}`}>—</span>;
  const cls = value > 0 ? 'text-up' : value < 0 ? 'text-down' : 'text-mist';
  // The direction has a shape as well as a colour, so it reads without colour vision.
  return (
    <span className={`num ${cls} ${className}`}>
      {value !== 0 && <span aria-hidden className="mr-0.5 text-[0.7em]">{value > 0 ? '▲' : '▼'}</span>}
      {`${value > 0 ? '+' : ''}${(value * 100).toFixed(2)}%`}
    </span>
  );
}

export function LimitNotice({ what, limit }: { what: string; limit: number }) {
  const t = tier(useTier());
  return (
    <p role="status" className="mt-2 text-xs text-warn">
      {t.name} plan limit reached: {limit} {what}.{' '}
      {t.id !== 'intelligence' && (
        <>
          Higher plans have higher limits.{' '}
          <a href="/pricing" className="underline hover:text-gold-soft">
            See plans
          </a>
          .
        </>
      )}
    </p>
  );
}

/**
 * A link to another Aurora module, styled as a small button with an arrow so it is recognisable as navigation
 * (directive §15). Use plain inline links only inside sentences.
 */
export function ModuleLink({ to, children, className = '' }: { to: string; children: ReactNode; className?: string }) {
  return (
    <Link
      to={to}
      className={`inline-flex min-h-8 items-center gap-1 rounded-md border border-gold-dim/50 bg-gold/5 px-2.5 py-1 text-xs text-gold-soft transition-colors hover:border-gold hover:bg-gold/10 ${className}`}
    >
      {children}
      <ArrowUpRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
    </Link>
  );
}

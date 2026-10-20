import type { IndicatorValue } from '../../shared/types';

const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 });

export function fmtNumber(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtPct(v: number | null | undefined, digits = 2, signed = false): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const s = (v * 100).toFixed(digits);
  return `${signed && v > 0 ? '+' : ''}${s}%`;
}

export function fmtCompact(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return compact.format(v);
}

export function fmtIndicator(v: IndicatorValue): string {
  if (v.value == null) return 'No data';
  switch (v.unit) {
    case 'usd':
      return `US$ ${compact.format(v.value)}`;
    case 'percent':
      return `${v.value.toFixed(1)}%`;
    case 'count':
      return compact.format(v.value);
    case 'km2':
      return `${compact.format(v.value)} km²`;
    case 'years':
      return `${v.value.toFixed(1)} yrs`;
    case 'per100':
      return `${v.value.toFixed(1)} per 100`;
  }
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function relativeTime(iso: string, now = Date.now()): string {
  const h = Math.round((now - Date.parse(iso)) / 3_600_000);
  if (h < 1) return 'within the hour';
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

import type { IndicatorFormat } from "../../shared/worldbank";

export function formatIndicator(value: number | null, format: IndicatorFormat): string {
  if (value == null || !Number.isFinite(value)) return "—";
  switch (format) {
    case "percent":
      return `${value.toFixed(1)}%`;
    case "usd":
      return `$${compact(value)}`;
    case "count":
      return compact(value);
  }
}

export function compact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e12) return `${(value / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toFixed(0);
}

export function pct(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(digits)}%`;
}

export function num(value: number, digits = 2): string {
  return Number.isFinite(value) ? value.toFixed(digits) : "—";
}

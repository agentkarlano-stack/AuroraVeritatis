import { useEffect, useState } from 'react';
import type { CompareYear, LatestValues } from '../../../shared/types';
import { getJson } from '../../lib/api';
import type { ChoroplethLayer } from '../../lib/geo/layers';

const NO_VALUES: Record<string, Map<string, number>> = {};
const NO_COUNTS: Record<string, number> = {};
const NO_YEARS: Record<string, Map<string, number>> = {};
const NO_SPANS: Record<string, { min: number; max: number } | null> = {};

/**
 * Country values for the active choropleth layers (World Bank via Aurora's API), refetched when the year changes.
 * `latest` layers show each country's most recent value; `years` then holds the year of every value.
 */
export function useChoropleths(layers: ChoroplethLayer[], year: number) {
  const key = `${layers.map((l) => l.id).join(',')}@${year}`;
  const [result, setResult] = useState<{
    key: string;
    values: Record<string, Map<string, number>>;
    years: Record<string, Map<string, number>>;
    spans: Record<string, { min: number; max: number } | null>;
    counts: Record<string, number>;
    errors: string[];
  }>({ key: '', values: {}, years: {}, spans: {}, counts: {}, errors: [] });
  useEffect(() => {
    if (!layers.length) return;
    const ctrl = new AbortController();
    Promise.all(
      layers.map(async (l) => {
        const [x, y] = l.derive ? [l.derive.numerator, l.derive.denominator] : [l.indicator, l.indicator];
        if (l.latest) {
          try {
            const d = await getJson<LatestValues>(`/api/map/${l.indicator}`, ctrl.signal);
            const m = new Map<string, number>();
            const ys = new Map<string, number>();
            for (const p of d.points) {
              m.set(p.iso3, p.value);
              ys.set(p.iso3, p.year);
            }
            return { id: l.id, m, ys, span: d.years, error: null as string | null };
          } catch (e) {
            return { id: l.id, m: new Map<string, number>(), ys: new Map<string, number>(), span: null, error: `${l.name}: ${(e as Error).message}` };
          }
        }
        try {
          const d = await getJson<CompareYear>(`/api/compare/${year}?x=${x}&y=${y}&size=${x}`, ctrl.signal);
          const m = new Map<string, number>();
          for (const p of d.points) {
            const v = l.derive ? (p.y > 0 ? (p.x / p.y) * (l.derive.scale ?? 1) : NaN) : p.x;
            if (Number.isFinite(v)) m.set(p.iso3, v);
          }
          return { id: l.id, m, ys: new Map<string, number>(), span: null, error: null as string | null };
        } catch (e) {
          return { id: l.id, m: new Map<string, number>(), ys: new Map<string, number>(), span: null, error: `${l.name}: ${(e as Error).message}` };
        }
      }),
    ).then((rows) => {
      if (ctrl.signal.aborted) return;
      setResult({ key, values: Object.fromEntries(rows.map((r) => [r.id, r.m])), years: Object.fromEntries(rows.map((r) => [r.id, r.ys])), spans: Object.fromEntries(rows.map((r) => [r.id, r.span])), counts: Object.fromEntries(rows.map((r) => [r.id, r.m.size])), errors: rows.flatMap((r) => (r.error ? [r.error] : [])) });
    });
    return () => ctrl.abort();
    // The key captures the layer ids and the year.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const ready = result.key === key;
  return { values: ready ? result.values : NO_VALUES, years: ready ? result.years : NO_YEARS, spans: ready ? result.spans : NO_SPANS, counts: ready ? result.counts : NO_COUNTS, errors: ready ? result.errors : [], loading: layers.length > 0 && !ready };
}


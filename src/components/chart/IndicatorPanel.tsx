import { Eye, EyeOff, Plus, Search, Star, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CATEGORIES, INDICATORS, INDICATOR_MAP, defaultParams, indicatorBlocker, indicatorLabel, type Category } from '../../lib/chart/indicators';
import { newUid, type IndicatorInstance } from '../../lib/chart/workspace';
import { useChartLibrary } from '../../store/chartLibrary';

type Tab = 'Favourites' | Category | 'All';
const TABS: Tab[] = ['Favourites', ...CATEGORIES, 'All'];

/** Searchable indicator library: categories, favourites, add several in a row. */
export function IndicatorLibrary({ data, onAdd, count }: { data: { hasOhlc: boolean; hasVolume: boolean }; onAdd: (inst: IndicatorInstance) => void; count: number }) {
  const { favourites, toggleFavourite } = useChartLibrary();
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<Tab>('All');
  const [added, setAdded] = useState<string | null>(null);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return INDICATORS.filter((d) => {
      if (needle) return `${d.name} ${d.short} ${d.category}`.toLowerCase().includes(needle);
      if (tab === 'Favourites') return favourites.includes(d.id);
      return tab === 'All' || d.category === tab;
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [q, tab, favourites]);
  const available = INDICATORS.filter((d) => !d.unavailable).length;
  return (
    <div className="space-y-2">
      <label className="relative block">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-dim" aria-hidden />
        <input className="input pl-8" placeholder="Search indicators" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search indicators" autoFocus />
      </label>
      {!q && (
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Indicator categories">
          {TABS.map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className="chip text-[11px]" aria-pressed={tab === t} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </div>
      )}
      <ul className="max-h-80 space-y-0.5 overflow-y-auto">
        {list.length === 0 && <li className="px-2 py-3 text-sm text-slate-dim">{tab === 'Favourites' && !q ? 'Star indicators to list them here.' : 'No indicator matches.'}</li>}
        {list.map((d) => {
          const blocked = indicatorBlocker(d, data);
          const fav = favourites.includes(d.id);
          return (
            <li key={d.id} className="flex items-start gap-1 rounded-md px-1 py-1 hover:bg-ink-800/60">
              <button className={`mt-0.5 shrink-0 p-1 ${fav ? 'text-gold' : 'text-slate-dim hover:text-mist'}`} aria-label={fav ? `Remove ${d.name} from favourites` : `Add ${d.name} to favourites`} aria-pressed={fav} onClick={() => toggleFavourite(d.id)}>
                <Star className="h-3.5 w-3.5" fill={fav ? 'currentColor' : 'none'} />
              </button>
              <div className="min-w-0 flex-1">
                <div className="text-sm text-platinum">{d.name}</div>
                <div className="text-[11px] leading-snug text-slate-dim">{blocked ?? d.description}</div>
              </div>
              <button
                className="btn-ghost shrink-0 px-2 py-1 text-xs"
                disabled={!!blocked || count >= 25}
                aria-label={`Add ${d.name}`}
                onClick={() => {
                  onAdd({ uid: newUid(), id: d.id, params: defaultParams(d) });
                  setAdded(d.name);
                }}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden /> Add
              </button>
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-slate-dim" role="status">
        {added ? `${added} added. Add more, or close the panel.` : `${available} indicators, each tested against its reference formula.`}
        {count >= 25 && ' Up to 25 indicators per chart.'}
      </p>
    </div>
  );
}

/** Settings for one indicator on the chart: parameters, colours, visibility, pane and removal. */
export function IndicatorSettings({ inst, onChange, onRemove }: { inst: IndicatorInstance; onChange: (next: IndicatorInstance) => void; onRemove: () => void }) {
  const def = INDICATOR_MAP.get(inst.id);
  if (!def) return null;
  const outputs = def.compute([], defaultParams(def), { periodsPerYear: 252 }).outputs;
  return (
    <div className="space-y-3 text-sm">
      <div>
        <div className="font-medium text-platinum">{def.name}</div>
        <div className="text-[11px] text-slate-dim">{def.description}</div>
      </div>
      {def.params.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {def.params.map((p) => (
            <label key={p.key} className="text-xs text-mist">
              {p.label}
              <input
                type="number"
                className="input mt-1"
                min={p.min}
                max={p.max}
                step={p.step}
                value={inst.params[p.key] ?? p.default}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v)) onChange({ ...inst, params: { ...inst.params, [p.key]: Math.min(p.max, Math.max(p.min, v)) } });
                }}
              />
            </label>
          ))}
        </div>
      )}
      {outputs.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {outputs.map((o) => (
            <label key={o.key} className="flex items-center gap-1.5 text-xs text-mist">
              <input
                type="color"
                className="h-6 w-8 cursor-pointer rounded border border-line bg-transparent"
                value={inst.colors?.[o.key] ?? o.color}
                onChange={(e) => onChange({ ...inst, colors: { ...inst.colors, [o.key]: e.target.value } })}
                aria-label={`${o.label} colour`}
              />
              {o.label}
            </label>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button className="btn-ghost text-xs" onClick={() => onChange({ ...inst, hidden: !inst.hidden })}>
          {inst.hidden ? <Eye className="h-3.5 w-3.5" aria-hidden /> : <EyeOff className="h-3.5 w-3.5" aria-hidden />} {inst.hidden ? 'Show' : 'Hide'}
        </button>
        {def.pane === 'price' && (
          <button className="btn-ghost text-xs" onClick={() => onChange({ ...inst, ownPane: !inst.ownPane })}>
            {inst.ownPane ? 'Move onto price chart' : 'Move to own panel'}
          </button>
        )}
        <button className="btn-ghost text-xs hover:border-down hover:text-down" onClick={onRemove}>
          <Trash2 className="h-3.5 w-3.5" aria-hidden /> Remove
        </button>
      </div>
      <p className="text-[11px] text-slate-dim">Shown on the chart as {indicatorLabel(def, inst.params)}.</p>
    </div>
  );
}

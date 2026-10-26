import { Info, Layers, RotateCcw, Search, Star, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { groupLayers, searchLayers } from '../../lib/geo/layerFinder';
import { DATA_NATURE, GEO_LAYERS, isActive, LAYER_MAP, type GeoLayer } from '../../lib/geo/layers';
import { MAX_LAYERS, type LayerState } from '../../lib/geo/state';

const FAV_KEY = 'av-layer-favourites';
function readFavs(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(FAV_KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Map Layers button and panel: one click opens it; search by everyday words; task categories; active count and chips;
 * per-layer info with source, update frequency and licence; unavailable layers stay listed with the reason; opacity
 * for active layers; reset to the default set; pinned favourites (this browser).
 */
export function LayerPanel({
  active,
  onChange,
  defaults,
  exclude = [],
  className = '',
}: {
  active: LayerState[];
  onChange: (next: LayerState[]) => void;
  defaults: LayerState[];
  exclude?: string[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [info, setInfo] = useState<string | null>(null);
  const [favs, setFavs] = useState<string[]>(readFavs);
  const [notice, setNotice] = useState<string | null>(null);
  const pool = useMemo(() => GEO_LAYERS.filter((l) => !exclude.includes(l.id)), [exclude]);
  const found = searchLayers(query, pool);
  const groups = groupLayers(found);
  const pinned = found.filter((l) => favs.includes(l.id));
  const on = (id: string) => active.some((l) => l.id === id);

  const toggle = (l: GeoLayer) => {
    if (!isActive(l)) return;
    if (on(l.id)) {
      onChange(active.filter((x) => x.id !== l.id));
      setNotice(null);
      return;
    }
    // One base map at a time: a new one replaces the previous.
    const base = l.category === 'Base maps' ? active.filter((x) => LAYER_MAP.get(x.id)?.category !== 'Base maps') : active;
    if (base.length >= MAX_LAYERS) {
      setNotice(`Up to ${MAX_LAYERS} layers at once keeps the map readable. Turn one off first.`);
      return;
    }
    const replaced = active.find((x) => !base.includes(x));
    setNotice(replaced ? `${l.name} replaces ${LAYER_MAP.get(replaced.id)?.name ?? replaced.id}.` : null);
    onChange([...base, { id: l.id, opacity: 1 }]);
  };
  const pin = (id: string) => {
    const next = favs.includes(id) ? favs.filter((f) => f !== id) : [...favs, id];
    setFavs(next);
    try {
      localStorage.setItem(FAV_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable: pins last for this visit */
    }
  };

  const row = (l: GeoLayer) => {
    const available = isActive(l);
    const st = active.find((x) => x.id === l.id);
    return (
      <li key={l.id} className="py-1">
        <div className="flex items-center gap-2">
          <label className={`flex min-h-8 flex-1 items-center gap-2 text-xs ${available ? 'cursor-pointer text-platinum' : 'text-slate-dim'}`}>
            <input type="checkbox" className="h-4 w-4 accent-[#c9a35a]" checked={!!st} disabled={!available} onChange={() => toggle(l)} />
            <span className="min-w-0 flex-1">
              {l.name}
              {!available && <span className="ml-1 text-[10px] uppercase tracking-wide text-slate-dim">not available yet</span>}
              {available && l.nature === 'simulated' && <span className="ml-1 text-[10px] uppercase tracking-wide text-warn">simulated</span>}
            </span>
          </label>
          <button className="tap text-slate-dim hover:text-gold" aria-label={favs.includes(l.id) ? `Unpin ${l.name}` : `Pin ${l.name}`} aria-pressed={favs.includes(l.id)} onClick={() => pin(l.id)}>
            <Star className={`h-3.5 w-3.5 ${favs.includes(l.id) ? 'text-gold' : ''}`} fill={favs.includes(l.id) ? 'currentColor' : 'none'} aria-hidden />
          </button>
          <button className="tap text-slate-dim hover:text-gold" aria-label={`About ${l.name}`} aria-expanded={info === l.id} onClick={() => setInfo(info === l.id ? null : l.id)}>
            <Info className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
        {st && l.kind !== 'events' && (
          <label className="ml-6 flex items-center gap-2 text-[10px] text-slate-dim">
            Opacity
            <input
              type="range"
              min={0.2}
              max={1}
              step={0.1}
              value={st.opacity}
              onChange={(e) => onChange(active.map((x) => (x.id === l.id ? { ...x, opacity: Number(e.target.value) } : x)))}
              aria-label={`Opacity of ${l.name}`}
              className="w-28 accent-[#c9a35a]"
            />
          </label>
        )}
        {info === l.id && (
          <div className="ml-6 mt-1 space-y-1 rounded-md border border-line bg-ink-900 p-2 text-[11px] leading-relaxed text-mist">
            <p>{l.interpretation}</p>
            {available ? (
              <p className="text-slate-dim">
                {DATA_NATURE[l.nature].label} · {l.updateFrequency} · {l.coverage} · Source:{' '}
                <a href={l.providerUrl} target="_blank" rel="noreferrer noopener" className="text-gold hover:underline">
                  {l.provider}
                </a>{' '}
                ({l.license})
              </p>
            ) : (
              <p className="text-slate-dim">
                Needed: {l.needs} Source:{' '}
                {l.providerUrl.startsWith('/') ? (
                  <Link to={l.providerUrl} className="text-gold hover:underline">
                    {l.provider}
                  </Link>
                ) : (
                  <a href={l.providerUrl} target="_blank" rel="noreferrer noopener" className="text-gold hover:underline">
                    {l.provider}
                  </a>
                )}
              </p>
            )}
            {available && l.uncertainty && <p className="text-slate-dim">Uncertainty: {l.uncertainty}</p>}
          </div>
        )}
      </li>
    );
  };

  return (
    <div className={`relative ${className}`}>
      <button className="chip bg-ink-950/85 text-[11px]" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((o) => !o)}>
        <Layers className="h-3.5 w-3.5" aria-hidden /> Layers <span className="num rounded bg-ink-800 px-1 text-gold">{active.length}</span>
      </button>
      {open && (
        <div
          className="absolute left-0 top-full z-30 mt-1 flex max-h-[min(70vh,560px)] w-[min(92vw,360px)] flex-col rounded-lg border border-line bg-ink-950/97 shadow-xl backdrop-blur"
          role="dialog"
          aria-label="Map layers"
        >
          <div className="space-y-2 border-b border-line p-3">
            <div className="flex items-center justify-between">
              <span className="eyebrow">Map layers</span>
              <button className="tap text-slate-dim hover:text-platinum" aria-label="Close layers" onClick={() => setOpen(false)}>
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <label className="relative block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-dim" aria-hidden />
              <input className="input h-8 pl-8 text-xs" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search: airports, ships, floods, NATO…" aria-label="Search layers" autoFocus />
            </label>
            {active.length > 0 && (
              <div className="flex flex-wrap gap-1" aria-label="Active layers">
                {active.map((a) => (
                  <button key={a.id} className="chip text-[10px]" onClick={() => onChange(active.filter((x) => x.id !== a.id))} aria-label={`Turn off ${LAYER_MAP.get(a.id)?.name ?? a.id}`}>
                    {LAYER_MAP.get(a.id)?.name ?? a.id} <X className="h-3 w-3" aria-hidden />
                  </button>
                ))}
              </div>
            )}
            {notice && (
              <p className="text-[11px] text-warn" role="status">
                {notice}
              </p>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2" data-scroll-panel>
            {pinned.length > 0 && (
              <section className="mb-2">
                <h3 className="eyebrow !text-[10px]">Pinned</h3>
                <ul>{pinned.map(row)}</ul>
              </section>
            )}
            {groups.map((g) => (
              <section key={g.category} className="mb-2">
                <h3 className="eyebrow !text-[10px]">{g.category}</h3>
                <ul>{g.layers.map(row)}</ul>
              </section>
            ))}
            {found.length === 0 && <p className="py-4 text-center text-xs text-slate-dim">No layer matches “{query}”.</p>}
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-line p-2">
            <button className="btn-ghost h-8 text-xs" onClick={() => {
                onChange(defaults);
                setNotice(null);
              }}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Reset to default
            </button>
            <Link to="/geo" className="text-[11px] text-gold hover:underline">
              All tools in Map Explorer
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

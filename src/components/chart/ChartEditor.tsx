import { CalendarRange, CandlestickChart, Download, FolderOpen, LayoutTemplate, LineChart, Maximize2, Minimize2, Minus, PenLine, Plus, Redo2, RotateCcw, Search, Settings2, Spline, Star, Trash2, Undo2, Upload, ZoomIn, ZoomOut } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { uid, usePrefs } from '../../store/prefs';
import { useChartLibrary } from '../../store/chartLibrary';
import { useChartFavourites } from '../../store/chartFavourites';
import { DRAW_TOOLS, type ChartFavourites, type DrawToolId } from '../../lib/chart/favourites';
import type { ChartPoint, Drawing } from '../../lib/chart';
import { CHART_TYPES, CHART_TYPE_MAP, type ChartTypeId } from '../../lib/chart/chartTypes';
import { composeExport, DEFAULT_EXPORT, downloadCanvas, downloadText, type ExportOptions } from '../../lib/chart/exportImage';
import { INDICATOR_MAP, defaultParams, indicatorBlocker, indicatorLabel } from '../../lib/chart/indicators';
import { INTERVAL_MAP, RANGES, intervalAvailability, resample, searchIntervals, type ChartRange, type IntervalId } from '../../lib/chart/intervals';
import { INSTRUMENT_OPTIONS, type Dataset } from '../../lib/chart/sources';
import { BUILT_IN_TEMPLATES, newUid, normalizeSettings, parseLayout, type ChartSettings, type IndicatorInstance, type SavedLayout } from '../../lib/chart/workspace';
import { LimitNotice, ProvenanceBadge } from '../ui';
import { limitOf, useTier } from '../../lib/entitlements';
import { AddToBrain } from '../AddToBrain';
import { ChartCanvas, type ChartAnnotation, type ChartApi } from './ChartCanvas';
import { ChartMenu, MenuOption } from './ChartMenu';
import { IndicatorLibrary, IndicatorSettings } from './IndicatorPanel';

type DrawMode = 'none' | DrawToolId;
const DRAW_ICON: Record<DrawToolId, typeof Minus> = { hline: Minus, trend: Spline, fib: PenLine };
const NO_DRAWINGS: Drawing[] = [];
const BACKGROUNDS = [
  { label: 'Charcoal', value: '#151517' },
  { label: 'Black', value: '#0b0b0c' },
  { label: 'Warm grey', value: '#1c1b19' },
];

/**
 * Interactive chart editor shared across Aurora: instrument, candle interval and history range as separate controls,
 * chart types, a searchable indicator library, drawings with undo/redo, templates, saved layouts, PNG and JSON export,
 * and a full-screen workspace. Settings persist in the preferences store (synced for signed-in users).
 */
export function ChartEditor({ dataset, symbol, onSymbolChange, annotations, loading, error }: {
  dataset: Dataset | null;
  symbol: string;
  onSymbolChange: (symbol: string) => void;
  annotations?: ChartAnnotation[];
  loading?: boolean;
  error?: string | null;
}) {
  const rawSettings = usePrefs((s) => s.chart);
  const settings = useMemo(() => normalizeSettings(rawSettings), [rawSettings]);
  const setChart = usePrefs((s) => s.setChart);
  const update = useCallback((patch: Partial<ChartSettings>) => setChart(patch), [setChart]);
  const drawings = usePrefs((s) => s.drawings[symbol]) ?? NO_DRAWINGS;
  const setDrawings = usePrefs((s) => s.setDrawings);
  const library = useChartLibrary();
  const { favs, toggle: toggleFav, update: updateFavs } = useChartFavourites();

  const shell = useRef<HTMLDivElement>(null);
  const api = useRef<ChartApi | null>(null);
  const [full, setFull] = useState<'off' | 'native' | 'app'>('off');
  const [mode, setMode] = useState<DrawMode>('none');
  const [pending, setPending] = useState<ChartPoint | null>(null);
  const [history, setHistory] = useState<{ past: Drawing[][]; future: Drawing[][] }>({ past: [], future: [] });
  const [notice, setNotice] = useState<string | null>(null);
  const [exportOpt, setExportOpt] = useState<ExportOptions>(DEFAULT_EXPORT);
  const [custom, setCustom] = useState<{ from: string; to: string }>({ from: '', to: '' });

  const data = { hasOhlc: dataset?.hasOhlc ?? true, hasVolume: dataset?.hasVolume ?? true };
  const interval: IntervalId = dataset && !intervalAvailability(dataset.baseInterval, settings.interval).ok ? dataset.baseInterval : settings.interval;
  const bars = useMemo(() => (dataset ? resample(dataset.bars, interval) : []), [dataset, interval]);
  const effective = useMemo(() => ({ ...settings, interval }), [settings, interval]);
  const typeDef = CHART_TYPE_MAP.get(settings.type)!;
  const typeFallback = typeDef.needsOhlc && !data.hasOhlc;

  // Full screen: the browser Fullscreen API when available, otherwise an in-app maximised view.
  useEffect(() => {
    const onChange = () => {
      const on = document.fullscreenElement === shell.current;
      setFull((f) => (on ? 'native' : f === 'native' ? 'off' : f));
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setMode('none');
      setPending(null);
      setFull((f) => (f === 'app' ? 'off' : f));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const toggleFull = () => {
    if (full === 'native') return void document.exitFullscreen?.();
    if (full === 'app') return setFull('off');
    const el = shell.current;
    if (el?.requestFullscreen && document.fullscreenEnabled) el.requestFullscreen().catch(() => setFull('app'));
    else setFull('app');
  };

  // Drawings with undo/redo (this session).
  const commit = (next: Drawing[]) => {
    setHistory((h) => ({ past: [...h.past.slice(-49), drawings], future: [] }));
    setDrawings(symbol, next);
  };
  const undo = () => {
    const prev = history.past.at(-1);
    if (!prev) return;
    setHistory((h) => ({ past: h.past.slice(0, -1), future: [drawings, ...h.future] }));
    setDrawings(symbol, prev);
  };
  const redo = () => {
    const next = history.future[0];
    if (!next) return;
    setHistory((h) => ({ past: [...h.past, drawings], future: h.future.slice(1) }));
    setDrawings(symbol, next);
  };
  const onPick = (p: ChartPoint) => {
    if (mode === 'hline') {
      commit([...drawings, { id: uid(), kind: 'hline', price: p.price }]);
      setMode('none');
    } else if (mode === 'trend' || mode === 'fib') {
      if (!pending) return setPending(p);
      if (pending.time !== p.time) commit([...drawings, { id: uid(), kind: mode, a: pending, b: p }]);
      setPending(null);
      setMode('none');
    }
  };

  const startDraw = (id: DrawToolId) => (setPending(null), setMode((m) => (m === id ? 'none' : id)));
  const setIndicators = (list: IndicatorInstance[]) => update({ indicators: list });
  const intervalLabel = INTERVAL_MAP.get(interval)!.label;
  const rangeLabel = 'preset' in settings.range ? RANGES.find((r) => r.id === (settings.range as { preset: string }).preset)!.label : `${(settings.range as { from: string }).from} to ${(settings.range as { to: string }).to}`;

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice((n) => (n === msg ? null : n)), 4000);
  };

  const exportPng = async () => {
    const shot = api.current?.screenshot();
    if (!shot || !dataset) return flash('The chart is not ready to export yet.');
    const out = composeExport(shot, exportOpt, {
      title: `${dataset.name}`,
      subtitle: `${intervalLabel} bars · ${rangeLabel} · ${CHART_TYPE_MAP.get(effective.type)!.label} · ${effective.indicators.filter((i) => !i.hidden).map((i) => indicatorLabel(INDICATOR_MAP.get(i.id)!, i.params)).join(', ') || 'no indicators'}`,
      source: `${dataset.provider}. ${dataset.licence}`,
      status: dataset.status,
    });
    await downloadCanvas(out, `aurora-chart-${symbol.replace(/[^A-Za-z0-9.-]/g, '_')}-${new Date().toISOString().slice(0, 10)}.png`).then(
      () => flash('Image downloaded with indicators and drawings.'),
      (e: Error) => flash(e.message),
    );
  };

  const layoutOf = (name: string): SavedLayout => ({ kind: 'aurora-chart-layout', version: 1, name, savedAt: new Date().toISOString(), symbol, settings, drawings });
  const openLayout = (l: SavedLayout) => {
    update(l.settings);
    setDrawings(l.symbol, l.drawings);
    if (l.symbol !== symbol) onSymbolChange(l.symbol);
    flash(`Opened “${l.name}”.`);
  };
  const importFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 512_000) return flash('That file is too large to be a chart layout.');
    void file.text().then((t) => {
      const l = parseLayout(t);
      if (!l) return flash('That file is not an Aurora chart layout.');
      library.saveLayout(l);
      openLayout(l);
    });
  };

  const isFull = full !== 'off';
  const fileInput = useRef<HTMLInputElement>(null);

  return (
    <section
      ref={shell}
      className={`panel flex min-w-0 flex-col ${isFull ? 'fixed inset-0 z-[60] h-dvh w-screen rounded-none border-0' : ''}`}
      aria-label="Chart editor"
    >
      {/* Toolbar: instrument · interval · range · type · indicators · drawing · templates · settings · layouts · export · full screen */}
      <div className="flex items-center gap-1.5 overflow-x-auto border-b border-line px-3 py-2 sm:flex-wrap sm:overflow-visible" role="toolbar" aria-label="Chart tools">
        <ChartMenu label={<span className="max-w-[9rem] truncate">{symbol.replace('ECB:', '')}</span>} icon={<Search className="h-3.5 w-3.5" aria-hidden />} title="Instrument" width="sm:w-80">
          {(close) => <InstrumentPicker current={symbol} onPick={(s) => (onSymbolChange(s), close())} />}
        </ChartMenu>
        <ChartMenu
          label={<span className="whitespace-nowrap">{intervalLabel}</span>}
          icon={<CandlestickChart className="h-3.5 w-3.5" aria-hidden />}
          title={`Candle interval: ${intervalLabel} per bar`}
          width="sm:w-72"
        >
          {(close) => <IntervalPicker current={interval} base={dataset?.baseInterval ?? null} favs={favs.intervals} onStar={(id) => toggleFav('intervals', id)} onPick={(id) => (update({ interval: id }), close())} />}
        </ChartMenu>
        <span className="mx-0.5 h-5 w-px shrink-0 bg-line" />
        <div className="flex shrink-0 items-center gap-1" role="group" aria-label="History range">
          <span className="hidden text-[11px] uppercase tracking-wider text-slate-dim md:inline">Range</span>
          {favs.ranges.map((id) => {
            const r = RANGES.find((x) => x.id === id)!;
            return (
              <button key={r.id} className="chip px-2" title={`Show ${r.label.toLowerCase()} of history`} aria-pressed={'preset' in settings.range && settings.range.preset === r.id} onClick={() => update({ range: { preset: r.id } })}>
                {r.id === 'ALL' ? 'All' : r.id}
              </button>
            );
          })}
          <ChartMenu
            label={favs.ranges.some((id) => 'preset' in settings.range && settings.range.preset === id) ? '' : <span className="whitespace-nowrap">{rangeLabel}</span>}
            icon={<CalendarRange className="h-3.5 w-3.5" aria-label="All ranges and custom dates" />}
            title="History range"
            active={!favs.ranges.some((id) => 'preset' in settings.range && settings.range.preset === id)}
            width="sm:w-72"
          >
            {(close) => (
              <div className="space-y-3">
                <div>
                  <p className="mb-1 text-[11px] text-slate-dim">How much history to show. Star a range to keep it in the toolbar. The candle interval is set separately.</p>
                  {RANGES.map((r) => (
                    <StarRow key={r.id} on={favs.ranges.includes(r.id)} name={r.label} onStar={() => toggleFav('ranges', r.id)}>
                      <MenuOption selected={'preset' in settings.range && settings.range.preset === r.id} onSelect={() => (update({ range: { preset: r.id } }), close())}>
                        {r.label}
                      </MenuOption>
                    </StarRow>
                  ))}
                </div>
                <form
                  className="space-y-2 border-t border-line pt-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (custom.from && custom.to && custom.from <= custom.to) {
                      update({ range: { from: custom.from, to: custom.to } as ChartRange });
                      close();
                    }
                  }}
                >
                  <div className="eyebrow">Custom dates</div>
                  <label className="block text-xs text-mist">
                    From
                    <input type="date" className="input mt-1" value={custom.from} min={bars[0]?.time} max={bars.at(-1)?.time} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} required />
                  </label>
                  <label className="block text-xs text-mist">
                    To
                    <input type="date" className="input mt-1" value={custom.to} min={bars[0]?.time} max={bars.at(-1)?.time} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} required />
                  </label>
                  <button className="btn-primary w-full text-xs" disabled={!custom.from || !custom.to || custom.from > custom.to}>
                    Show this range
                  </button>
                </form>
              </div>
            )}
          </ChartMenu>
        </div>
        <span className="mx-0.5 h-5 w-px shrink-0 bg-line" />
        <ChartMenu label={typeFallback ? 'Line' : CHART_TYPE_MAP.get(settings.type)!.label} icon={<LineChart className="h-3.5 w-3.5" aria-hidden />} title="Chart type" width="sm:w-72">
          {(close) => (
            <div>
              {(['Standard', 'Advanced'] as const).map((g) => (
                <div key={g} className="mb-2">
                  <div className="eyebrow mb-1">{g}</div>
                  {CHART_TYPES.filter((t) => t.group === g).map((t) => (
                    <StarRow key={t.id} on={favs.types.includes(t.id as ChartTypeId)} name={t.label} onStar={() => toggleFav('types', t.id)}>
                      <MenuOption
                        selected={settings.type === t.id}
                        disabled={t.needsOhlc && !data.hasOhlc}
                        reason={t.needsOhlc && !data.hasOhlc ? 'Needs open, high and low prices. This source publishes closing values only.' : null}
                        hint={t.description}
                        onSelect={() => (update({ type: t.id as ChartTypeId }), close())}
                      >
                        {t.label}
                      </MenuOption>
                    </StarRow>
                  ))}
                </div>
              ))}
              <p className="text-[11px] text-slate-dim">Renko, Line Break, Kagi and Point &amp; Figure are planned.</p>
            </div>
          )}
        </ChartMenu>
        <ChartMenu label={`Indicators${settings.indicators.length ? ` (${settings.indicators.length})` : ''}`} title="Indicators" width="sm:w-[26rem]">
          {() => <IndicatorLibrary data={data} count={settings.indicators.length} onAdd={(inst) => setIndicators([...settings.indicators, inst])} />}
        </ChartMenu>
        <ChartMenu label={mode === 'none' ? 'Draw' : DRAW_TOOLS.find((d) => d.id === mode)!.label} icon={<PenLine className="h-3.5 w-3.5" aria-hidden />} title="Drawing tools" active={mode !== 'none'} width="sm:w-72">
          {(close) => (
            <div>
              {DRAW_TOOLS.map((d) => (
                <StarRow key={d.id} on={favs.drawings.includes(d.id)} name={d.label} onStar={() => toggleFav('drawings', d.id)}>
                  <MenuOption selected={mode === d.id} hint={d.title} onSelect={() => (startDraw(d.id), close())}>
                    {d.label}
                  </MenuOption>
                </StarRow>
              ))}
              <p className="mt-1 text-[11px] text-slate-dim">Drawings are saved per instrument. Undo and redo are next to this menu.</p>
            </div>
          )}
        </ChartMenu>
        <button className="btn-quiet shrink-0 px-1.5" onClick={undo} disabled={!history.past.length} aria-label="Undo drawing" title="Undo">
          <Undo2 className="h-4 w-4" />
        </button>
        <button className="btn-quiet shrink-0 px-1.5" onClick={redo} disabled={!history.future.length} aria-label="Redo drawing" title="Redo">
          <Redo2 className="h-4 w-4" />
        </button>
        <span className="mx-0.5 h-5 w-px shrink-0 bg-line" />
        <ChartMenu label="Templates" icon={<LayoutTemplate className="h-3.5 w-3.5" aria-hidden />} title="Chart templates" width="sm:w-80" align="right">
          {(close) => <Templates settings={settings} favs={favs.templates} onStar={(id) => toggleFav('templates', id)} onApply={(s) => (update(s), close(), flash('Template applied.'))} />}
        </ChartMenu>
        <ChartMenu label="" icon={<Settings2 className="h-3.5 w-3.5" aria-label="Chart settings" />} title="Chart settings" width="sm:w-72" align="right">
          {() => <Appearance settings={settings} onChange={update} />}
        </ChartMenu>
        <ChartMenu label="Saved" icon={<FolderOpen className="h-3.5 w-3.5" aria-hidden />} title="Saved charts" width="sm:w-80" align="right">
          {(close) => (
            <SavedCharts
              onSave={(name) => (library.saveLayout(layoutOf(name)), flash(`Saved “${name}” in this browser.`))}
              onOpen={(l) => (openLayout(l), close())}
              onImport={() => fileInput.current?.click()}
            />
          )}
        </ChartMenu>
        <ChartMenu label="" icon={<Download className="h-3.5 w-3.5" aria-label="Export" />} title="Export" width="sm:w-72" align="right">
          {(close) => (
            <div className="space-y-2 text-sm">
              {(
                [
                  ['details', 'Instrument, settings and time stamp'],
                  ['branding', 'Aurora Veritatis branding'],
                  ['attribution', 'Data source attribution'],
                ] as const
              ).map(([k, l]) => (
                <label key={k} className="flex items-center gap-2 text-mist">
                  <input type="checkbox" checked={exportOpt[k]} onChange={(e) => setExportOpt((o) => ({ ...o, [k]: e.target.checked }))} /> {l}
                </label>
              ))}
              <label className="flex items-center justify-between gap-2 text-mist">
                Frame
                <select className="input w-auto" value={exportOpt.frame} onChange={(e) => setExportOpt((o) => ({ ...o, frame: e.target.value as 'dark' | 'light' }))}>
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                </select>
              </label>
              <button className="btn-primary w-full text-xs" onClick={() => void exportPng().then(close)}>
                Download PNG
              </button>
              <button className="btn-ghost w-full text-xs" onClick={() => (downloadText(JSON.stringify(layoutOf(`${symbol} chart`), null, 2), `aurora-chart-${symbol.replace(/[^A-Za-z0-9.-]/g, '_')}.json`), close())}>
                Download editable layout (JSON)
              </button>
              <p className="text-[11px] text-slate-dim">The image is the visible chart with its indicators and drawings, at screen resolution. SVG export is not offered: the chart is drawn on a canvas.</p>
            </div>
          )}
        </ChartMenu>
        <button
          className={`btn-quiet shrink-0 px-1.5 ${favs.bar ? 'text-gold' : ''}`}
          onClick={() => updateFavs({ bar: !favs.bar })}
          aria-pressed={favs.bar}
          aria-label={favs.bar ? 'Hide the favourites bar' : 'Show the favourites bar'}
          title="Favourites bar: star intervals, ranges, chart types, indicators, drawing tools and templates in their menus"
        >
          <Star className="h-4 w-4" fill={favs.bar ? 'currentColor' : 'none'} />
        </button>
        <button className="btn-quiet shrink-0 px-1.5" onClick={toggleFull} aria-label={isFull ? 'Exit full screen' : 'Full screen'} title={isFull ? 'Exit full screen (Esc)' : 'Full screen'}>
          {isFull ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
        <input ref={fileInput} type="file" accept="application/json,.json" className="hidden" aria-hidden tabIndex={-1} onChange={(e) => (importFile(e.target.files?.[0]), (e.target.value = ''))} />
      </div>

      {favs.bar && (
        <FavouritesBar
          favs={favs}
          interval={interval}
          base={dataset?.baseInterval ?? null}
          type={settings.type}
          mode={mode}
          hasOhlc={data.hasOhlc}
          templates={library.templates}
          onInterval={(id) => update({ interval: id })}
          onType={(id) => update({ type: id })}
          onIndicator={(id) => {
            const def = INDICATOR_MAP.get(id)!;
            setIndicators([...settings.indicators, { uid: newUid(), id, params: defaultParams(def) }]);
            flash(`${def.name} added.`);
          }}
          onDraw={startDraw}
          onTemplate={(t) => (update(t), flash('Template applied.'))}
        />
      )}

      {/* Indicators on the chart */}
      {(settings.indicators.length > 0 || drawings.length > 0 || mode !== 'none' || notice) && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-3 py-1.5 text-xs">
          {settings.indicators.map((inst) => {
            const def = INDICATOR_MAP.get(inst.id)!;
            const blocked = indicatorBlocker(def, data);
            return (
              <ChartMenu
                key={inst.uid}
                label={<span className={inst.hidden || blocked ? 'line-through opacity-60' : ''}>{indicatorLabel(def, inst.params)}</span>}
                title={blocked ? `${def.name}: ${blocked}` : `${def.name} settings`}
                width="sm:w-80"
              >
                {(close) => (
                  <>
                    {blocked && <p className="mb-2 text-[11px] text-warn">{blocked}</p>}
                    <IndicatorSettings
                      inst={inst}
                      onChange={(next) => setIndicators(settings.indicators.map((i) => (i.uid === inst.uid ? next : i)))}
                      onRemove={() => (setIndicators(settings.indicators.filter((i) => i.uid !== inst.uid)), close())}
                    />
                  </>
                )}
              </ChartMenu>
            );
          })}
          {drawings.length > 0 && (
            <button
              className="btn-quiet ml-auto text-xs"
              onClick={() => {
                if (confirm(`Remove all ${drawings.length} drawings from ${symbol}?`)) commit([]);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden /> Clear drawings ({drawings.length})
            </button>
          )}
          {mode !== 'none' && (
            <span role="status" className="basis-full text-gold-soft">
              {mode === 'hline' ? 'Click the chart to place a level.' : mode === 'fib' && !pending ? 'Click the start of the move (100%).' : mode === 'fib' ? `Start ${pending!.time} at ${pending!.price}. Click the end of the move (0%).` : pending ? `First point ${pending.time} at ${pending.price}. Click the second point.` : 'Click the first point.'}{' '}
              <span className="text-slate-dim">(Esc to cancel)</span>
            </span>
          )}
          {notice && (
            <span role="status" className="basis-full text-up">
              {notice}
            </span>
          )}
        </div>
      )}

      <div className={`relative ${isFull ? 'min-h-0 flex-1' : 'h-[460px] sm:h-[520px]'}`}>
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-dim">Loading prices…</div>
        ) : error || !dataset ? (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-down">{error ?? 'No data for this instrument.'}</div>
        ) : (
          <>
            <ChartCanvas bars={bars} settings={effective} hasOhlc={data.hasOhlc} hasVolume={data.hasVolume} decimals={dataset.decimals} drawings={drawings} annotations={annotations} onPick={mode === 'none' ? undefined : onPick} apiRef={api} />
            <div className="absolute left-2 top-2 z-10 flex gap-1">
              <button className="btn-quiet bg-ink-900/80 px-1.5" onClick={() => api.current?.zoom(0.7)} aria-label="Zoom in">
                <ZoomIn className="h-4 w-4" />
              </button>
              <button className="btn-quiet bg-ink-900/80 px-1.5" onClick={() => api.current?.zoom(1.4)} aria-label="Zoom out">
                <ZoomOut className="h-4 w-4" />
              </button>
              <button className="btn-quiet bg-ink-900/80 px-1.5" onClick={() => api.current?.resetView()} aria-label="Reset view to the selected range">
                <RotateCcw className="h-4 w-4" />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Data disclosure */}
      {dataset && (
        <footer className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line px-3 py-2 text-[11px] text-slate-dim">
          <ProvenanceBadge kind={dataset.provenance} />
          <span>{dataset.status}</span>
          <span>{dataset.provider}</span>
          <span>
            {dataset.assetType} · {dataset.currency}
          </span>
          <span>
            Published at {INTERVAL_MAP.get(dataset.baseInterval)!.label} bars, shown as {intervalLabel} bars
          </span>
          <span>Time zone: {dataset.timezone}</span>
          <span>
            History {dataset.bars[0]?.time} to {dataset.bars.at(-1)?.time} (last update)
          </span>
          {typeFallback && <span className="text-warn">{typeDef.label} needs OHLC prices; showing a line of closing values.</span>}
          {!dataset.hasOhlc && <span>Closing values only: no open, high, low or volume are published, and none are invented.</span>}
          <span className="ml-auto">
            <AddToBrain
              entity={{
                kind: 'instrument',
                label: `${dataset.name} chart`,
                ref: { type: 'instrument', symbol },
                notes: `Chart analysis: ${intervalLabel} bars, ${rangeLabel}, ${typeDef.label}. Indicators: ${settings.indicators.map((i) => indicatorLabel(INDICATOR_MAP.get(i.id)!, i.params)).join(', ') || 'none'}. Drawings: ${drawings.length}. Source: ${dataset.provider}.`,
              }}
            />
          </span>
        </footer>
      )}
    </section>
  );
}

function InstrumentPicker({ current, onPick }: { current: string; onPick: (s: string) => void }) {
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const list = INSTRUMENT_OPTIONS.filter((o) => !needle || `${o.symbol} ${o.name}`.toLowerCase().includes(needle));
  const groups = [...new Set(list.map((o) => o.group))];
  return (
    <div className="space-y-2">
      <input className="input" placeholder="Search instruments" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search instruments" autoFocus />
      <div className="max-h-80 overflow-y-auto">
        {groups.map((g) => (
          <div key={g} className="mb-2">
            <div className="eyebrow mb-1">{g}</div>
            {list
              .filter((o) => o.group === g)
              .map((o) => (
                <MenuOption key={o.symbol} selected={o.symbol === current} onSelect={() => onPick(o.symbol)} hint={o.name}>
                  <span className="flex items-center gap-2">
                    {o.symbol.replace('ECB:', '')} <ProvenanceBadge kind={o.provenance} />
                  </span>
                </MenuOption>
              ))}
          </div>
        ))}
        {!list.length && <p className="px-2 py-3 text-sm text-slate-dim">No instrument matches.</p>}
      </div>
    </div>
  );
}

function Templates({ settings, favs, onStar, onApply }: { settings: ChartSettings; favs: string[]; onStar: (id: string) => void; onApply: (s: ChartSettings) => void }) {
  const { templates, saveTemplate, renameTemplate, duplicateTemplate, deleteTemplate } = useChartLibrary();
  const [name, setName] = useState('');
  const max = limitOf(useTier(), 'chartTemplates');
  const full = templates.length >= max;
  return (
    <div className="space-y-3 text-sm">
      <div>
        <div className="eyebrow mb-1">Aurora templates</div>
        {BUILT_IN_TEMPLATES.map((t) => (
          <StarRow key={t.id} on={favs.includes(t.id)} name={t.name} onStar={() => onStar(t.id)}>
            <MenuOption onSelect={() => onApply(t.settings)} hint={`${INTERVAL_MAP.get(t.settings.interval)!.label} · ${t.settings.indicators.map((i) => indicatorLabel(INDICATOR_MAP.get(i.id)!, i.params)).join(', ')}`}>
              {t.name}
            </MenuOption>
          </StarRow>
        ))}
      </div>
      <div>
        <div className="eyebrow mb-1">Your templates</div>
        {!templates.length && <p className="px-2 text-xs text-slate-dim">None yet. Save the current settings below.</p>}
        {templates.map((t) => (
          <div key={t.id} className="flex items-center gap-1">
            <div className="min-w-0 flex-1">
              <MenuOption onSelect={() => onApply(t.settings)}>{t.name}</MenuOption>
            </div>
            <StarButton on={favs.includes(t.id)} name={t.name} onClick={() => onStar(t.id)} />
            <button className="btn-quiet px-1 text-[11px]" onClick={() => {
              const n = prompt('Rename template', t.name);
              if (n?.trim()) renameTemplate(t.id, n.trim());
            }}>
              Rename
            </button>
            <button className="btn-quiet px-1 text-[11px]" disabled={full} onClick={() => duplicateTemplate(t.id)}>
              Copy
            </button>
            <button className="btn-quiet px-1 text-[11px]" onClick={() => downloadText(JSON.stringify({ kind: 'aurora-chart-template', name: t.name, settings: t.settings }, null, 2), `aurora-template-${t.name.replace(/[^A-Za-z0-9-]/g, '_')}.json`)}>
              Export
            </button>
            <button className="btn-quiet px-1 text-[11px] hover:text-down" onClick={() => confirm(`Delete template “${t.name}”?`) && deleteTemplate(t.id)}>
              Delete
            </button>
          </div>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim() || full) return;
          saveTemplate(name.trim(), settings);
          setName('');
        }}
      >
        <input className="input" placeholder="Template name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Template name" maxLength={60} />
        <button className="btn-ghost shrink-0 text-xs" disabled={!name.trim() || full}>
          Save current
        </button>
      </form>
      {full && <LimitNotice what="chart templates" limit={max} />}
      <p className="text-[11px] text-slate-dim">A template stores the interval, range, chart type, indicators and appearance, not the instrument or drawings.</p>
    </div>
  );
}

function Appearance({ settings, onChange }: { settings: ChartSettings; onChange: (p: Partial<ChartSettings>) => void }) {
  const a = settings.appearance;
  const set = (p: Partial<ChartSettings['appearance']>) => onChange({ appearance: { ...a, ...p } });
  return (
    <div className="space-y-3 text-sm text-mist">
      <div className="flex items-center justify-between gap-2">
        <span>Rising bars</span>
        <input type="color" value={a.up} onChange={(e) => set({ up: e.target.value })} aria-label="Rising bar colour" className="h-6 w-10 rounded border border-line bg-transparent" />
      </div>
      <div className="flex items-center justify-between gap-2">
        <span>Falling bars</span>
        <input type="color" value={a.down} onChange={(e) => set({ down: e.target.value })} aria-label="Falling bar colour" className="h-6 w-10 rounded border border-line bg-transparent" />
      </div>
      <label className="flex items-center justify-between gap-2">
        Background
        <select className="input w-auto" value={a.background} onChange={(e) => set({ background: e.target.value })}>
          {BACKGROUNDS.map((b) => (
            <option key={b.value} value={b.value}>
              {b.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center justify-between gap-2">
        Price scale
        <select className="input w-auto" value={a.scale} onChange={(e) => set({ scale: e.target.value as ChartSettings['appearance']['scale'] })}>
          <option value="linear">Linear</option>
          <option value="log">Logarithmic</option>
          <option value="percent">Percent from first visible bar</option>
        </select>
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={a.grid} onChange={(e) => set({ grid: e.target.checked })} /> Grid lines
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={settings.events} onChange={(e) => onChange({ events: e.target.checked })} /> Event markers
      </label>
      <button className="btn-ghost w-full text-xs" onClick={() => onChange({ appearance: { up: '#5e9f7e', down: '#c2605b', background: '#151517', grid: true, scale: 'linear' } })}>
        Restore default colours
      </button>
    </div>
  );
}

function SavedCharts({ onSave, onOpen, onImport }: { onSave: (name: string) => void; onOpen: (l: SavedLayout) => void; onImport: () => void }) {
  const { layouts, renameLayout, duplicateLayout, deleteLayout } = useChartLibrary();
  const [name, setName] = useState('');
  const max = limitOf(useTier(), 'savedCharts');
  const full = layouts.length >= max;
  return (
    <div className="space-y-3 text-sm">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim() || full) return;
          onSave(name.trim());
          setName('');
        }}
      >
        <input className="input" placeholder="Name this analysis" value={name} onChange={(e) => setName(e.target.value)} aria-label="Chart name" maxLength={80} />
        <button className="btn-primary shrink-0 text-xs" disabled={!name.trim() || full}>
          Save
        </button>
      </form>
      {full && <LimitNotice what="saved charts" limit={max} />}
      <div>
        {!layouts.length && <p className="px-2 text-xs text-slate-dim">No saved charts yet. A saved chart keeps the instrument, settings, indicators and drawings, ready to edit later.</p>}
        {layouts.map((l) => (
          <div key={l.savedAt} className="flex items-center gap-1">
            <div className="min-w-0 flex-1">
              <MenuOption onSelect={() => onOpen(l)} hint={`${l.symbol.replace('ECB:', '')} · ${l.savedAt.slice(0, 16).replace('T', ' ')}`}>
                {l.name}
              </MenuOption>
            </div>
            <button className="btn-quiet px-1 text-[11px]" onClick={() => {
              const n = prompt('Rename saved chart', l.name);
              if (n?.trim()) renameLayout(l.savedAt, n.trim());
            }}>
              Rename
            </button>
            <button className="btn-quiet px-1 text-[11px]" disabled={full} onClick={() => duplicateLayout(l.savedAt)}>
              Copy
            </button>
            <button className="btn-quiet px-1 text-[11px]" onClick={() => downloadText(JSON.stringify(l, null, 2), `aurora-chart-${l.name.replace(/[^A-Za-z0-9-]/g, '_')}.json`)}>
              Export
            </button>
            <button className="btn-quiet px-1 text-[11px] hover:text-down" onClick={() => confirm(`Delete “${l.name}”?`) && deleteLayout(l.savedAt)}>
              Delete
            </button>
          </div>
        ))}
      </div>
      <button className="btn-ghost w-full text-xs" onClick={onImport}>
        <Upload className="h-3.5 w-3.5" aria-hidden /> Import a chart (JSON)
      </button>
      <p className="text-[11px] text-slate-dim">Saved in this browser. Cloud sync for saved charts is planned.</p>
    </div>
  );
}

/** Searchable candle-interval list, laid out like the indicator library ("4h", "4 hours", "hourly", "weekly"). */
function IntervalPicker({ current, base, favs, onStar, onPick }: { current: IntervalId; base: IntervalId | null; favs: IntervalId[]; onStar: (id: IntervalId) => void; onPick: (id: IntervalId) => void }) {
  const [q, setQ] = useState('');
  const list = searchIntervals(q).map((i) => ({ def: i, av: base ? intervalAvailability(base, i.id) : ({ ok: true } as const) }));
  const firstOk = list.find((x) => x.av.ok);
  return (
    <div className="space-y-2">
      <label className="relative block">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-dim" aria-hidden />
        <input
          className="input pl-8"
          placeholder="Search intervals (4h, daily, weekly)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && firstOk) {
              e.preventDefault();
              onPick(firstOk.def.id);
            }
          }}
          aria-label="Search intervals"
          autoFocus
        />
      </label>
      <p className="text-[11px] text-slate-dim">How much time each candle covers. The history range is set separately. Star an interval for the favourites bar.</p>
      <ul className="max-h-80 space-y-0.5 overflow-y-auto">
        {list.length === 0 && <li className="px-2 py-3 text-sm text-slate-dim">No interval matches.</li>}
        {(['Minutes', 'Hours', 'Days and longer'] as const).map((g) => {
          const rows = list.filter((x) => x.def.group === g);
          if (!rows.length) return null;
          return (
            <li key={g}>
              <div className="eyebrow mb-1 mt-1">{g}</div>
              {rows.map(({ def, av }) => (
                <StarRow key={def.id} on={favs.includes(def.id)} name={def.label} onStar={() => onStar(def.id)}>
                  <MenuOption selected={current === def.id} disabled={!av.ok} reason={av.ok ? null : av.reason} onSelect={() => onPick(def.id)}>
                    {def.label}
                  </MenuOption>
                </StarRow>
              ))}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Star toggle used in every chart menu (favourites are synced with the account). */
function StarButton({ on, name, onClick }: { on: boolean; name: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`shrink-0 p-1.5 ${on ? 'text-gold' : 'text-slate-dim hover:text-mist'}`}
      aria-label={on ? `Remove ${name} from favourites` : `Add ${name} to favourites`}
      aria-pressed={on}
      onClick={onClick}
    >
      <Star className="h-3.5 w-3.5" fill={on ? 'currentColor' : 'none'} />
    </button>
  );
}

function StarRow({ on, name, onStar, children }: { on: boolean; name: string; onStar: () => void; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-1">
      <div className="min-w-0 flex-1">{children}</div>
      <StarButton on={on} name={name} onClick={onStar} />
    </div>
  );
}

/** Compact row of the user's favourite intervals, chart types, indicators, drawing tools and templates. */
function FavouritesBar({ favs, interval, base, type, mode, hasOhlc, templates, onInterval, onType, onIndicator, onDraw, onTemplate }: {
  favs: ChartFavourites;
  interval: IntervalId;
  base: IntervalId | null;
  type: ChartTypeId;
  mode: DrawMode;
  hasOhlc: boolean;
  templates: { id: string; name: string; settings: ChartSettings }[];
  onInterval: (id: IntervalId) => void;
  onType: (id: ChartTypeId) => void;
  onIndicator: (id: string) => void;
  onDraw: (id: DrawToolId) => void;
  onTemplate: (s: ChartSettings) => void;
}) {
  const tpl = favs.templates.map((id) => BUILT_IN_TEMPLATES.find((t) => t.id === id) ?? templates.find((t) => t.id === id)).filter((t) => !!t);
  const groups: [string, React.ReactNode[]][] = [
    [
      'Interval',
      favs.intervals.map((id) => {
        const def = INTERVAL_MAP.get(id)!;
        const av = base ? intervalAvailability(base, id) : ({ ok: true } as const);
        return (
          <button key={id} className="chip shrink-0 px-2" aria-pressed={interval === id} disabled={!av.ok} title={av.ok ? `Candle interval: ${def.label}` : av.reason} onClick={() => onInterval(id)}>
            {def.label}
          </button>
        );
      }),
    ],
    [
      'Type',
      favs.types.map((id) => {
        const t = CHART_TYPE_MAP.get(id)!;
        const off = t.needsOhlc && !hasOhlc;
        return (
          <button key={id} className="chip shrink-0 px-2" aria-pressed={type === id} disabled={off} title={off ? 'Needs open, high and low prices.' : t.description} onClick={() => onType(id)}>
            {t.label}
          </button>
        );
      }),
    ],
    [
      'Add',
      favs.indicators.map((id) => {
        const def = INDICATOR_MAP.get(id)!;
        return (
          <button key={id} className="chip shrink-0 px-2" disabled={!!def.unavailable} title={def.unavailable ?? `Add ${def.name}`} aria-label={`Add ${def.name}`} onClick={() => onIndicator(id)}>
            <Plus className="h-3 w-3" aria-hidden /> {def.short}
          </button>
        );
      }),
    ],
    [
      'Draw',
      favs.drawings.map((id) => {
        const d = DRAW_TOOLS.find((x) => x.id === id)!;
        const Icon = DRAW_ICON[id];
        return (
          <button key={id} className="chip shrink-0 px-2" aria-pressed={mode === id} title={d.title} onClick={() => onDraw(id)}>
            <Icon className="h-3.5 w-3.5" aria-hidden /> {d.label}
          </button>
        );
      }),
    ],
    [
      'Template',
      tpl.map((t) => (
        <button key={t.id} className="chip shrink-0 px-2" title="Apply this template" onClick={() => onTemplate(t.settings)}>
          {t.name}
        </button>
      )),
    ],
  ];
  const shown = groups.filter(([, items]) => items.length);
  return (
    <div className="flex items-center gap-3 overflow-x-auto border-b border-line px-3 py-1.5 sm:flex-wrap sm:gap-y-1.5 sm:overflow-visible" role="toolbar" aria-label="Favourites">
      {shown.length === 0 ? (
        <span className="text-xs text-slate-dim">Star intervals, chart types, indicators, drawing tools or templates in their menus to list them here.</span>
      ) : (
        shown.map(([label, items]) => (
          <div key={label} className="flex shrink-0 items-center gap-1" role="group" aria-label={`Favourite ${label.toLowerCase()}`}>
            <span className="text-[10px] uppercase tracking-wider text-slate-dim">{label}</span>
            {items}
          </div>
        ))
      )}
    </div>
  );
}


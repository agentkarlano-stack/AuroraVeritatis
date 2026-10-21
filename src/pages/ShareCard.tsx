import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { HOME } from '../../shared/copy';
import { CARD_COPY, SHARE_IMAGES, type CardVariant } from '../../shared/share';
import { BrainCanvas } from '../components/BrainCanvas';
import { Globe } from '../components/Globe';
import { Monogram } from '../components/Logo';
import { LineChart } from '../components/SvgCharts';
import { TEMPLATES, visibleGraph } from '../lib/brain';
import { fitView, nodeBoxes } from '../lib/brainLayout';
import { demoBars } from '../lib/demoMarket';

const noop = () => {};

/**
 * Render target for social assets (`scripts/render-share-assets.mjs`): one card at an exact pixel size, built from
 * Aurora's own components. Not linked from the site and marked noindex. `?id=<asset>&t=<0..1>` (t rotates the globe
 * for the Story animation frames).
 */
export default function ShareCard() {
  const [params] = useSearchParams();
  const asset = SHARE_IMAGES.find((a) => a.id === params.get('id')) ?? SHARE_IMAGES[0]!;
  const [frameT, setFrameT] = useState<number | null>(null);
  // The asset renderer steps animation frames with a DOM event instead of reloading the page for each frame.
  useEffect(() => {
    const on = (e: Event) => setFrameT(Number((e as CustomEvent<number>).detail) || 0);
    window.addEventListener('av-share-frame', on);
    return () => window.removeEventListener('av-share-frame', on);
  }, []);
  const t = Math.min(1, Math.max(0, frameT ?? (Number(params.get('t') ?? 0) || 0)));
  const { width: W, height: H, variant } = asset;
  const portrait = H > W;
  /** Tall story (9:16) vs. the shorter 4:5 portrait post, which needs a smaller headline and globe to fit. */
  const tallStory = H / W > 1.5;
  const square = H === W;

  return (
    <div style={{ width: W, height: H }} className="relative overflow-hidden bg-ink-950 text-platinum" data-share-card={asset.id}>
      {/* Thin gold frame: the only ornament. */}
      <div className="pointer-events-none absolute border border-gold/35" style={{ inset: 22 * (portrait ? 1.4 : 1) }} />
      <div className="absolute flex flex-col" style={{ inset: portrait ? 96 : 64, gap: portrait ? 56 : square ? 40 : 0 }}>
        <Brand size={portrait || square ? 1.35 : 1} />
        {portrait || square ? (
          <>
            <Headline variant={variant} size={tallStory ? 1.9 : 1.6} />
            <div className="flex flex-1 items-center justify-center">
              <Visual variant={variant} t={t} size={tallStory ? Math.min(W - 160, H * 0.48) : portrait ? H * 0.36 : W * 0.56} wide={W - 192} tall={H * 0.4} />
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-1 items-center">
              <div className="max-w-[560px]">
                <Headline variant={variant} size={1} />
              </div>
            </div>
            {/* Landscape: only the globe may bleed past the frame; data panels stay fully inside it. */}
            {variant === 'markets' || variant === 'brain' ? (
              <div className="absolute right-0 top-1/2 -translate-y-1/2">
                <Visual variant={variant} t={t} size={0} wide={500} tall={variant === 'markets' ? 300 : 340} />
              </div>
            ) : (
              <div className="absolute top-1/2 -translate-y-1/2" style={{ right: -150 }}>
                <Visual variant={variant} t={t} size={600} wide={0} tall={0} />
              </div>
            )}
          </>
        )}
        {/* On landscape globe cards the globe covers the right corner, so the footer keeps only the address. */}
        <Footer variant={variant} size={portrait || square ? 1.3 : 1} addressOnly={!portrait && !square && variant !== 'markets' && variant !== 'brain'} />
      </div>
    </div>
  );
}

function Brand({ size }: { size: number }) {
  return (
    <div className="flex items-center gap-4">
      <div style={{ height: 34 * size }}>
        <Monogram className="h-full w-auto" title="Aurora Veritatis" />
      </div>
      <div className="border-l border-gold/50 pl-4">
        <div className="font-display font-bold tracking-[0.08em]" style={{ fontSize: 17 * size }}>
          AURORA VERITATIS
        </div>
        <div className="font-display font-medium tracking-[0.2em] text-gold" style={{ fontSize: 9.5 * size }}>
          GLOBAL ANALYSIS &amp; STRATEGIC INSIGHT
        </div>
      </div>
    </div>
  );
}

function Headline({ variant, size }: { variant: CardVariant; size: number }) {
  if (variant === 'home') {
    return (
      <div>
        <h1 className="font-semibold leading-[1.08]" style={{ fontSize: 50 * size }}>
          {HOME.heroLine1}
          <br />
          <span className="text-gold">{HOME.heroLine2}</span>
        </h1>
        <p className="mt-5 text-mist" style={{ fontSize: 20 * size, lineHeight: 1.45 }}>
          {HOME.supporting}
        </p>
      </div>
    );
  }
  const c = CARD_COPY[variant];
  return (
    <div>
      <div className="font-display font-semibold uppercase tracking-[0.22em] text-gold" style={{ fontSize: 13 * size }}>
        {variant === 'markets' ? 'Official data and research tools' : variant === 'brain' ? 'Your research, connected' : variant === 'radar' ? 'Live hazard data' : 'World Bank Open Data'}
      </div>
      <h1 className="mt-3 font-semibold leading-[1.1]" style={{ fontSize: 46 * size }}>
        {c.title}
      </h1>
      <p className="mt-4 text-mist" style={{ fontSize: 20 * size, lineHeight: 1.45 }}>
        {c.line}
      </p>
    </div>
  );
}

function Visual({ variant, t, size, wide, tall }: { variant: CardVariant; t: number; size: number; wide: number; tall: number }) {
  if (variant === 'markets') {
    const bars = demoBars('GLB-EQ.D').slice(-180);
    return (
      <div className="rounded-xl border border-line bg-ink-900 p-5" style={{ width: wide, height: tall }}>
        <div className="mb-2 flex items-center justify-between text-[13px]">
          <span className="font-medium text-platinum">Relative performance</span>
          <span className="rounded border border-gold-dim px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gold">Simulated</span>
        </div>
        <LineChart points={bars.map((b) => ({ date: b.time, value: b.close }))} format={(v) => v.toFixed(0)} />
      </div>
    );
  }
  if (variant === 'brain') {
    const g = TEMPLATES[0]!.build();
    const vis = visibleGraph(g, new Set(), new Set());
    const view = fitView(nodeBoxes(vis.nodes), wide, tall, 16);
    return (
      <div className="overflow-hidden rounded-xl border border-line bg-[#111113]" style={{ width: wide, height: tall }}>
        <BrainCanvas graph={vis} view={view} selection={null} highlight={new Set()} onView={noop} onSelect={noop} onMove={noop} onMoveEnd={noop} onConnect={noop} onAddAt={noop} onDelete={noop} onFit={noop} onToggleGroup={noop} />
      </div>
    );
  }
  const lon = (variant === 'countries' ? -10 : variant === 'radar' ? 70 : 15) + 360 * t;
  return <Globe size={size} lon={lon} lat={variant === 'radar' ? 15 : 24} title="Globe drawn from Natural Earth boundaries" />;
}

function Footer({ variant, size, addressOnly }: { variant: CardVariant; size: number; addressOnly: boolean }) {
  return (
    <div className="flex items-end justify-between text-slate-dim" style={{ fontSize: 14 * size }}>
      <span className="font-display font-semibold tracking-[0.12em] text-platinum">AURORAV.APP</span>
      {!addressOnly && <span>{variant === 'home' ? HOME.earlyAccess : 'Early access. Free to explore.'}</span>}
    </div>
  );
}

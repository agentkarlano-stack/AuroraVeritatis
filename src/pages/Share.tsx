import { Check, Copy, Download, Share2 } from 'lucide-react';
import { useState } from 'react';
import { SITE } from '../../shared/meta';
import { MEDIA_BASE, SHARE_IMAGES, SHARE_TEXT, STORY_VIDEO } from '../../shared/share';
import { PageHeader, Panel } from '../components/ui';

const LINKS = [
  { label: 'Homepage', path: '/' },
  { label: 'Global Radar', path: '/radar' },
  { label: 'Country dossiers', path: '/countries' },
  { label: 'Market Terminal', path: '/markets' },
  { label: 'Macro & FX', path: '/macro' },
  { label: 'Personal Intelligence Brain', path: '/brain' },
];

const media = (file: string) => `${MEDIA_BASE}/${file}`;
const absolute = (path: string) => `${SITE.origin}${path === '/' ? '/' : path}`;

function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<'idle' | 'done' | 'failed'>('idle');
  const copy = () => {
    navigator.clipboard
      .writeText(text)
      .then(() => setState('done'))
      .catch(() => setState('failed'))
      .finally(() => setTimeout(() => setState('idle'), 2000));
  };
  return (
    <button className="btn-ghost text-xs" onClick={copy} aria-label={`${label}: ${text}`}>
      {state === 'done' ? <Check className="h-3.5 w-3.5 text-up" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
      {state === 'done' ? 'Copied' : state === 'failed' ? 'Copy failed' : label}
    </button>
  );
}

export default function Share() {
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const nativeShare = () => {
    navigator.share({ title: SITE.name, text: SHARE_TEXT, url: absolute('/') }).catch(() => {});
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <PageHeader eyebrow="Share" title="Share Aurora Veritatis">
        Link previews, Story and post images made from Aurora's own interface. Download them, or copy a link to share.
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title="Links" eyebrow="Each link shows its own preview image">
          <ul className="divide-y divide-line/60">
            {LINKS.map((l) => (
              <li key={l.path} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  <span className="block text-sm text-platinum">{l.label}</span>
                  <span className="block truncate text-xs text-slate-dim">{absolute(l.path)}</span>
                </span>
                <CopyButton text={absolute(l.path)} label="Copy link" />
              </li>
            ))}
          </ul>
          {canShare && (
            <button className="btn-primary mt-3 text-sm" onClick={nativeShare}>
              <Share2 className="h-4 w-4" aria-hidden /> Share…
            </button>
          )}
        </Panel>
        <Panel title="Suggested text">
          <p className="text-sm leading-relaxed text-mist">{SHARE_TEXT}</p>
          <div className="mt-3">
            <CopyButton text={`${SHARE_TEXT} ${absolute('/')}`} label="Copy text and link" />
          </div>
          <p className="mt-4 text-xs leading-relaxed text-slate-dim">
            Everything in these images comes from the live product: the approved headline, the globe drawn from Natural Earth
            boundaries, and real interface components. Charts marked “Simulated” use demonstration prices, not market data.
          </p>
        </Panel>
      </div>

      <Panel title="Story animation" eyebrow={`${STORY_VIDEO.width} × ${STORY_VIDEO.height} · ${STORY_VIDEO.seconds} s loop · no sound`} className="mt-4">
        <div className="flex flex-col gap-4 sm:flex-row">
          <video
            className="aspect-[9/16] w-full max-w-[220px] rounded-lg border border-line bg-ink-900"
            controls
            muted
            loop
            playsInline
            preload="none"
            poster={media(STORY_VIDEO.poster)}
            aria-label="Aurora Veritatis Story animation: a slowly turning globe with the headline See the world. Understand its impact."
          >
            <source src={media(STORY_VIDEO.webm)} type="video/webm" />
            <source src={media(STORY_VIDEO.mp4)} type="video/mp4" />
          </video>
          <div className="space-y-2 text-sm text-mist">
            <p>A quiet ten-second loop of the Aurora globe for Instagram and Facebook Stories. MP4 (H.264) works on every platform.</p>
            <div className="flex flex-wrap gap-2">
              <a className="btn-ghost text-xs" href={media(STORY_VIDEO.mp4)} download>
                <Download className="h-3.5 w-3.5" aria-hidden /> Download MP4
              </a>
              <a className="btn-ghost text-xs" href={media(STORY_VIDEO.webm)} download>
                <Download className="h-3.5 w-3.5" aria-hidden /> Download WebM
              </a>
              <CopyButton text={`${SITE.origin}${media(STORY_VIDEO.mp4)}`} label="Copy video link" />
            </div>
          </div>
        </div>
      </Panel>

      <h2 className="mb-3 mt-8 text-lg font-semibold">Images</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {SHARE_IMAGES.map((img) => (
          <div key={img.id} className="panel flex flex-col p-3">
            <div className="flex items-center justify-center overflow-hidden rounded-md border border-line bg-ink-900" style={{ aspectRatio: '16 / 10' }}>
              <img src={media(img.file)} alt={img.alt} loading="lazy" width={img.width} height={img.height} className="max-h-full max-w-full object-contain" />
            </div>
            <div className="mt-3 text-sm font-medium text-platinum">{img.label}</div>
            <div className="text-xs text-slate-dim">{img.use}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <a className="btn-ghost text-xs" href={media(img.file)} download>
                <Download className="h-3.5 w-3.5" aria-hidden /> Download
              </a>
              <CopyButton text={`${SITE.origin}${media(img.file)}`} label="Copy image link" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

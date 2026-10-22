export interface ExportOptions {
  branding: boolean;
  details: boolean;
  attribution: boolean;
  frame: 'dark' | 'light';
}

export interface ExportMeta {
  title: string;
  subtitle: string;
  source: string;
  status: string;
}

export const DEFAULT_EXPORT: ExportOptions = { branding: true, details: true, attribution: true, frame: 'dark' };

/**
 * Frames a chart screenshot (the chart library renders every pane, series, indicator and drawing into it) with an
 * optional header (instrument, interval, time stamp), Aurora branding and the data source.
 */
export function composeExport(shot: HTMLCanvasElement, opt: ExportOptions, meta: ExportMeta, now = new Date()): HTMLCanvasElement {
  // Screenshots are rendered at the device pixel ratio; text in the frame is scaled to match.
  const scale = Math.max(1, typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1);
  const pad = Math.round(20 * scale);
  const header = opt.details || opt.branding ? Math.round(52 * scale) : 0;
  const footer = opt.attribution || opt.details ? Math.round(30 * scale) : 0;
  const out = document.createElement('canvas');
  out.width = shot.width + pad * 2;
  out.height = shot.height + pad * 2 + header + footer;
  const g = out.getContext('2d');
  if (!g) return shot;
  const dark = opt.frame === 'dark';
  g.fillStyle = dark ? '#0d0d0e' : '#f6f5f1';
  g.fillRect(0, 0, out.width, out.height);
  const ink = dark ? '#f1f0ec' : '#1a1a1c';
  const dim = dark ? '#9a978f' : '#5e5c57';
  const font = (px: number, weight = 400) => `${weight} ${Math.round(px * scale)}px Inter, system-ui, sans-serif`;
  let y = pad;
  if (header) {
    if (opt.details) {
      g.fillStyle = ink;
      g.font = font(17, 600);
      g.fillText(meta.title, pad, y + 20 * scale);
      g.fillStyle = dim;
      g.font = font(12);
      g.fillText(meta.subtitle, pad, y + 40 * scale);
    }
    if (opt.branding) {
      g.textAlign = 'right';
      g.fillStyle = '#c9a35a';
      g.font = font(13, 700);
      g.fillText('AURORA VERITATIS', out.width - pad, y + 20 * scale);
      g.fillStyle = dim;
      g.font = font(11);
      g.fillText('aurorav.app', out.width - pad, y + 38 * scale);
      g.textAlign = 'left';
    }
    y += header;
  }
  g.drawImage(shot, pad, y);
  y += shot.height;
  if (footer) {
    g.fillStyle = dim;
    g.font = font(11);
    const parts = [opt.attribution ? `Source: ${meta.source}` : '', opt.details ? `${meta.status} · Exported ${now.toISOString().slice(0, 16).replace('T', ' ')} UTC` : ''].filter(Boolean);
    g.fillText(parts.join(' · '), pad, y + 20 * scale);
  }
  return out;
}

export function downloadCanvas(canvas: HTMLCanvasElement, filename: string): Promise<void> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error('The image could not be created.'));
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      resolve();
    }, 'image/png');
  });
}

export function downloadText(text: string, filename: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

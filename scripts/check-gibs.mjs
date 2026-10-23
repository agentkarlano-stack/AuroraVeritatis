#!/usr/bin/env node
// Verifies every NASA GIBS layer in the Map Explorer catalogue against the live service: fetches one tile per layer
// (yesterday for daily layers, the fixed date otherwise) and, for any failure, looks the layer up in the official
// WMTS capabilities to report the correct tile matrix set and format. Prints GitHub annotations; informational only
// (exit 0), because the map itself reports layers that fail to load.
// Usage: node scripts/check-gibs.mjs   (needs Node 22.18+ for TypeScript type stripping)
import { GEO_LAYERS, gibsTiles } from '../src/lib/geo/layers.ts';

const CAPS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml';
const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
const layers = GEO_LAYERS.filter((l) => l.kind === 'gibs');

async function tile(l) {
  const url = gibsTiles(l, yesterday).replace('{z}', '1').replace('{y}', '0').replace('{x}', '1');
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    const type = res.headers.get('content-type') ?? '';
    return { ok: res.ok && type.startsWith('image/'), status: res.status, type, url };
  } catch (e) {
    return { ok: false, status: 0, type: String(e), url };
  }
}

let caps = null;
async function lookup(id) {
  if (caps === null) {
    try {
      caps = await (await fetch(CAPS, { signal: AbortSignal.timeout(60_000) })).text();
    } catch {
      caps = '';
    }
  }
  if (!caps) return 'capabilities document unavailable';
  const at = caps.indexOf(`<ows:Identifier>${id}</ows:Identifier>`);
  if (at < 0) return 'not in the GIBS EPSG:3857 capabilities';
  const start = caps.lastIndexOf('<Layer>', at);
  const end = caps.indexOf('</Layer>', at);
  const block = caps.slice(start, end);
  const sets = [...block.matchAll(/<TileMatrixSet>([^<]+)<\/TileMatrixSet>/g)].map((m) => m[1]);
  const formats = [...block.matchAll(/<Format>([^<]+)<\/Format>/g)].map((m) => m[1]);
  const def = /<Default>([^<]+)<\/Default>/.exec(block)?.[1];
  return `capabilities: matrix set ${sets.join(' / ') || '?'}, format ${formats.join(' / ') || '?'}, default time ${def ?? 'none'}`;
}

const results = await Promise.all(layers.map(async (l) => ({ l, r: await tile(l) })));
let failed = 0;
for (const { l, r } of results) {
  if (r.ok) continue;
  failed++;
  console.log(`::warning title=GIBS layer ${l.id}::${l.gibs.layer} → HTTP ${r.status} ${r.type.slice(0, 60)}; ${await lookup(l.gibs.layer)}; tried ${r.url}`);
}
console.log(`::notice title=GIBS layers::${layers.length - failed}/${layers.length} NASA GIBS layers returned a tile (date ${yesterday})`);

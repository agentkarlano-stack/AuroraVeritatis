#!/usr/bin/env node
// Verifies every NASA GIBS layer in the Map Explorer catalogue against the live service: fetches one tile per layer
// (yesterday for daily layers, the fixed date otherwise) and, for any failure, looks the layer up in the official
// WMTS capabilities to report the correct tile matrix set and format. Prints GitHub annotations; informational only
// (exit 0), because the map itself reports layers that fail to load.
// Usage: node scripts/check-gibs.mjs   (needs Node 22.18+ for TypeScript type stripping)
import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader as Pbf } from 'pbf';
import { GEO_LAYERS, effectiveDate, gibsTiles } from '../src/lib/geo/layers.ts';

const CAPS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml';
const today = new Date().toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
const layers = GEO_LAYERS.filter((l) => l.kind === 'gibs');

async function tile(l) {
  const template = gibsTiles(l, effectiveDate(l, yesterday, today));
  const at = (y, x) => template.replace('{z}', '1').replace('{y}', String(y)).replace('{x}', String(x));
  if (l.gibs.ext === 'mvt') {
    // Vector services answer 404 for empty tiles: sample all four zoom-1 tiles and expect at least one with data.
    const found = [];
    let last = { status: 0, url: at(0, 0) };
    for (const [y, x] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
      try {
        const res = await fetch(at(y, x), { signal: AbortSignal.timeout(20_000) });
        last = { status: res.status, url: at(y, x) };
        if (!res.ok) continue;
        const tile = new VectorTile(new Pbf(new Uint8Array(await res.arrayBuffer())));
        found.push(...Object.keys(tile.layers));
      } catch (e) {
        last = { status: 0, url: `${at(y, x)} (${e})` };
      }
    }
    const want = l.gibs.sourceLayer ?? l.gibs.layer;
    return { ok: found.includes(want), status: last.status, type: `vector layers: ${[...new Set(found)].join(', ') || 'none (all four tiles empty or missing)'}`, url: last.url };
  }
  const url = at(0, 1);
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    const type = res.headers.get('content-type') ?? '';
    if (l.gibs.ext === 'mvt') {
      // Vector tiles: decode and confirm the source layer the map draws.
      if (!res.ok) return { ok: false, status: res.status, type, url };
      const tile = new VectorTile(new Pbf(new Uint8Array(await res.arrayBuffer())));
      const names = Object.keys(tile.layers);
      const want = l.gibs.sourceLayer ?? l.gibs.layer;
      return { ok: names.includes(want) || names.length === 0, status: res.status, type: `vector layers: ${names.join(', ') || 'none in this tile'}`, url };
    }
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
for (const { l, r } of results) if (r.ok && l.gibs.ext === 'mvt') console.log(`::notice title=GIBS vector layer ${l.id}::${r.type}`);
console.log(`::notice title=GIBS layers::${layers.length - failed}/${layers.length} NASA GIBS layers returned a tile (daily layers: newest published date, up to ${yesterday})`);

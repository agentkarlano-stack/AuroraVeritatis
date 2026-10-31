/**
 * Mapbox globe check on a deployed URL (preview workflow, informational): opens Global Radar in a real browser on the
 * GitHub runner (cloud sessions cannot reach Mapbox), waits for the Mapbox style to load and reports the result as one
 * annotation: renderer, load state, map loads in the session, Mapbox requests and their failures, console errors.
 * It never prints the token. Usage: BASE_URL=https://… node e2e/map-check.ts
 */
import { chromium } from 'playwright-core';

const base = (process.env.BASE_URL ?? 'https://aurorav.app').replace(/\/$/, '');
const browser = await chromium.launch({ channel: process.env.CHROMIUM_PATH ? undefined : 'chrome', executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.addInitScript(() => {
  try {
    localStorage.setItem('av-prefs', JSON.stringify({ state: { intro: 'none' }, version: 99 }));
  } catch {
    /* ignore */
  }
});
const errors: string[] = [];
const mapbox = { ok: 0, failed: new Map<number, number>(), tiles: 0 };
const otherFailures: string[] = [];
page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text().replace(/access_token=[^&\s]+/g, 'access_token=[redacted]').slice(0, 160)));
page.on('response', (r) => {
  const u = r.url();
  if (!/mapbox\.com/.test(u)) {
    if (r.status() >= 400) otherFailures.push(`${r.status()} ${new URL(u).pathname}`);
    return;
  }
  if (r.ok()) {
    mapbox.ok++;
    if (/\/v4\/|tiles|\.pbf|\.webp|\.png|\.jpg/.test(u)) mapbox.tiles++;
  } else mapbox.failed.set(r.status(), (mapbox.failed.get(r.status()) ?? 0) + 1);
});
await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
let provider = 'none';
let loaded = false;
for (let i = 0; i < 40 && !loaded; i++) {
  await page.waitForTimeout(500);
  provider = (await page.locator('[data-map-provider]').first().getAttribute('data-map-provider', { timeout: 300 }).catch(() => null)) ?? (await page.locator('canvas.maplibregl-canvas').count() ? 'maplibre' : 'none');
  loaded = (await page.locator('[data-map-loaded="1"]').count()) > 0;
}
// Interact: zoom and pan (must not create new map loads), then click a country.
if (loaded) {
  const box = await page.locator('[data-map-provider] canvas').first().boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -300);
    await page.waitForTimeout(1500);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(1500);
  }
}
const news = await page.evaluate(async () => {
  const r = await fetch('/api/news?t=24h').then((x) => x.json()).catch(() => null) as { stories?: { articles: { provider?: string }[]; summary?: string }[]; source?: { name: string } } | null;
  const arts = (r?.stories ?? []).flatMap((s) => s.articles);
  return { stories: r?.stories?.length ?? 0, fromTheNewsApi: arts.filter((a) => a.provider === 'thenewsapi').length, withSummary: (r?.stories ?? []).filter((s) => s.summary).length, sources: r?.source?.name ?? '' };
});
const loads = await page.evaluate(() => Number(sessionStorage.getItem('av-mapbox-loads') ?? 0));
const failed = [...mapbox.failed].map(([s, n]) => `${s}×${n}`).join(', ') || 'none';
await page.screenshot({ path: 'map-check.png' });
const msg = `renderer=${provider}; styleLoaded=${loaded}; mapLoadsThisSession=${loads}; mapboxResponsesOk=${mapbox.ok} (tiles ${mapbox.tiles}); mapboxFailures=${failed}; pageErrors=${errors.length}; failedRequests=${otherFailures.slice(0, 4).join(', ') || 'none'}; news: stories=${news.stories}, articlesFromTheNewsApi=${news.fromTheNewsApi}, storiesWithSummary=${news.withSummary}, sources=${news.sources}`;
console.log(`::notice title=Map check::${msg}`);
await browser.close();

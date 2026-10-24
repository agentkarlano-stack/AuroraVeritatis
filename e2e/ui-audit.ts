/// <reference lib="dom" />
/**
 * Read-only UI audit of a deployed Aurora Veritatis (production or a preview). No accounts, no forms submitted, no
 * emails sent. For every route and viewport it records page errors, console errors, horizontal overflow (with the
 * elements that cause it), unnamed controls and undersized touch targets; then it runs a few interaction checks
 * (brand intro, mobile menu, chart menus, map explorer, briefing) and the security headers.
 *
 * Usage: BASE_URL=https://aurorav.app node e2e/ui-audit.ts      (Node 22.18+; CHROMIUM_PATH optional)
 * QUICK=1 runs the post-merge subset: key routes at a phone, a tablet and a desktop width, plus every interaction
 * check and the headers. The full sweep (all routes × 9 widths) runs nightly when main changed, and on demand.
 * Prints GitHub annotations and writes ui-audit-results.json.
 */
import { writeFileSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright-core';

const BASE = (process.env.BASE_URL ?? 'https://aurorav.app').replace(/\/$/, '');
const ALL_ROUTES = ['/', '/hq', '/radar', '/geo', '/briefing', '/countries', '/countries/compare', '/countries/vs', '/countries/DEU', '/markets', '/markets/commodities', '/lab', '/lab/forecasts', '/impact', '/strategy', '/tension', '/positioning', '/macro', '/currency', '/brain', '/assistant', '/share', '/pricing', '/business', '/signin', '/account', '/newsletter', '/status', '/about', '/legal/terms', '/legal/imprint', '/legal/privacy'];
const QUICK = process.env.QUICK === '1';
const QUICK_ROUTES = ['/', '/hq', '/radar', '/geo', '/countries/DEU', '/markets', '/lab', '/impact', '/brain', '/account', '/pricing', '/about'];
const ROUTES = QUICK ? QUICK_ROUTES : ALL_ROUTES;
const WIDTHS = QUICK ? [360, 768, 1440] : [320, 360, 375, 390, 414, 768, 1024, 1440, 1920];
const SLOW = new Set(['/geo', '/markets', '/briefing', '/radar']);

interface Issue {
  kind: string;
  route: string;
  width: number;
  detail: string;
}
const issues: Issue[] = [];
const checks: { name: string; ok: boolean; detail?: string }[] = [];
const note = (kind: string, route: string, width: number, detail: string) => issues.push({ kind, route, width, detail: detail.slice(0, 300) });
const check = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, ...(detail ? { detail: detail.slice(0, 300) } : {}) });

async function inspect(page: Page): Promise<{ overflow: number; culprits: string[]; unnamed: string[]; smallTargets: string[] }> {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const overflow = document.documentElement.scrollWidth - vw;
    const culprits: string[] = [];
    if (overflow > 0) {
      for (const el of Array.from(document.querySelectorAll('body *'))) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.right <= vw + 1) continue;
        let p = el.parentElement;
        let contained = false;
        while (p) {
          if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(p).overflowX)) {
            contained = true;
            break;
          }
          p = p.parentElement;
        }
        if (!contained) culprits.push(`${el.tagName.toLowerCase()}.${String((el as HTMLElement).className).slice(0, 60)} → ${Math.round(r.right)}px`);
        if (culprits.length >= 3) break;
      }
    }
    const visible = (el: Element) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
    };
    const controls = Array.from(document.querySelectorAll('button, a[href], [role="button"], input:not([type="hidden"]), select, textarea')).filter(visible);
    const unnamed = controls
      .filter((el) => {
        const labelled = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title');
        const text = (el.textContent ?? '').trim();
        const id = el.getAttribute('id');
        const forLabel = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
        const wrapped = el.closest('label');
        const placeholder = el.getAttribute('placeholder');
        return !(labelled || text || forLabel || wrapped || placeholder) && el.getAttribute('aria-hidden') !== 'true' && el.getAttribute('tabindex') !== '-1';
      })
      .map((el) => el.outerHTML.slice(0, 120));
    const smallTargets =
      vw < 700
        ? controls
            .filter((el) => {
              const r = el.getBoundingClientRect();
              const st = getComputedStyle(el);
              // WCAG 2.5.8 exceptions: inline text links, visually hidden skip links; map markers have list alternatives.
              if (el.classList.contains('sr-only') || (el.tagName === 'A' && st.display === 'inline')) return false;
              if (el.closest('svg, [role="application"], .maplibregl-map, .tv-lightweight-charts')) return false;
              if (!(r.width < 24 || r.height < 24) || el.closest('p, li') || el.tagName === 'INPUT') return false;
              // Spacing exception: an undersized target passes when a 24 px circle on its centre overlaps no other target.
              const cx = r.left + r.width / 2;
              const cy = r.top + r.height / 2;
              return controls.some((o) => {
                if (o === el || o.contains(el) || el.contains(o)) return false;
                const q = o.getBoundingClientRect();
                const dx = Math.max(q.left - cx, 0, cx - q.right);
                const dy = Math.max(q.top - cy, 0, cy - q.bottom);
                return dx * dx + dy * dy < 144;
              });
            })
            .map((el) => `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)}" ${Math.round(el.getBoundingClientRect().width)}×${Math.round(el.getBoundingClientRect().height)}`)
        : [];
    return { overflow, culprits, unnamed: unnamed.slice(0, 5), smallTargets: smallTargets.slice(0, 5) };
  });
}

async function sweep(browser: Browser) {
  for (const width of WIDTHS) {
    const mobile = width < 700;
    const ctx = await browser.newContext({ viewport: { width, height: mobile ? 844 : 900 }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
    await ctx.addInitScript(() => {
      try {
        sessionStorage.setItem('av-intro-shown', '1');
        localStorage.setItem('av-last-seen', String(Date.now()));
        // Inspect pages without an introduction overlay.
        if (!localStorage.getItem('av-prefs-v1')) localStorage.setItem('av-prefs-v1', JSON.stringify({ state: { intro: 'none' }, version: 1 }));
      } catch {
        /* ignore */
      }
    });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      const t = m.text();
      if (/Failed to load resource|net::ERR|status of 4\d\d|status of 5\d\d|cloudflareinsights/i.test(t)) return;
      errors.push(`console: ${t}`);
    });
    for (const route of ROUTES) {
      errors.length = 0;
      try {
        const res = await page.goto(BASE + route, { waitUntil: 'load', timeout: 45_000 });
        if (!res || res.status() >= 400) note('http', route, width, `HTTP ${res?.status()}`);
        await page.waitForTimeout(SLOW.has(route) ? 3500 : 1500);
        const r = await inspect(page);
        if (r.overflow > 0) note('overflow', route, width, `${r.overflow}px; ${r.culprits.join(' | ')}`);
        if (r.unnamed.length) note('unnamed-control', route, width, r.unnamed.join(' ;; '));
        if (r.smallTargets.length) note('small-touch-target', route, width, r.smallTargets.join(' ;; '));
        for (const e of [...new Set(errors)]) note('error', route, width, e);
      } catch (e) {
        note('load', route, width, (e as Error).message);
      }
    }
    await ctx.close();
  }
}

async function interactions(browser: Browser) {
  // Introduction (lib/intro.ts): film on the first-ever visit, brand intro afterwards, nothing on navigation or with
  // reduced motion; the film is downloaded only when it plays.
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const filmRequests: string[] = [];
    ctx.on('request', (r) => r.url().includes('/media/intro/') && filmRequests.push(r.url()));
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`);
    const skip = page.getByRole('button', { name: 'Skip intro' });
    const plays = await skip.waitFor({ timeout: 4000 }).then(() => true, () => false);
    const film = plays && (await page.locator('video').count()) > 0;
    check('Cinematic intro plays on the first-ever visit', film, film ? `film requested: ${filmRequests.length} file(s)` : 'no film');
    if (plays) await skip.click();
    await page.getByRole('link', { name: 'Global Radar' }).first().click();
    await page.waitForTimeout(800);
    check('Intro does not replay on client navigation', (await skip.count()) === 0);
    await page.reload();
    await page.waitForTimeout(1500);
    check('Intro does not replay on a reload', (await skip.count()) === 0);
    // A later visit: a new tab after the visit gap.
    await page.evaluate(() => localStorage.setItem('av-last-seen', String(Date.now() - 31 * 60_000)));
    filmRequests.length = 0;
    const later = await ctx.newPage();
    await later.goto(`${BASE}/`);
    const laterSkip = later.getByRole('button', { name: 'Skip intro' });
    const brand = (await laterSkip.waitFor({ timeout: 4000 }).then(() => true, () => false)) && (await later.locator('video').count()) === 0;
    check('Brand intro (no film) on a later visit', brand && filmRequests.length === 0, `film requests: ${filmRequests.length}`);
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`);
    await page.waitForTimeout(2000);
    check('No intro with reduced motion', (await page.getByRole('button', { name: 'Skip intro' }).count()) === 0);
    await ctx.close();
  }
  // Mobile menu.
  {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(() => sessionStorage.setItem('av-intro-shown', '1'));
    const page = await ctx.newPage();
    await page.goto(`${BASE}/hq`);
    await page.getByRole('button', { name: 'Open menu' }).click();
    const nav = page.getByRole('navigation', { name: 'Mobile' });
    check('Mobile menu opens with all main links', (await nav.isVisible()) && (await nav.getByRole('link').count()) >= 7);
    await ctx.close();
  }
  // Chart menus visible above the chart, at desktop and phone width.
  for (const width of [1440, 390]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 700, hasTouch: width < 700 });
    await ctx.addInitScript(() => sessionStorage.setItem('av-intro-shown', '1'));
    const page = await ctx.newPage();
    await page.goto(`${BASE}/markets`);
    await page.waitForTimeout(2500);
    const toolbar = page.getByRole('toolbar', { name: 'Chart tools' });
    const menus = toolbar.locator('button[aria-haspopup="dialog"]');
    const n = await menus.count();
    const hidden: string[] = [];
    for (let i = 0; i < n; i++) {
      const btn = menus.nth(i);
      const title = (await btn.getAttribute('title')) ?? `menu ${i}`;
      await btn.scrollIntoViewIfNeeded();
      await btn.click();
      await page.waitForTimeout(200);
      const ok = await page
        .getByRole('dialog', { name: title })
        .evaluate((el) => {
          const r = el.getBoundingClientRect();
          return r.height > 40 && r.top >= 0 && r.bottom <= innerHeight + 1 && el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + 20));
        })
        .catch(() => false);
      if (!ok) hidden.push(title);
      await page.keyboard.press('Escape');
    }
    check(`Chart menus fully visible (${width}px, ${n} menus)`, n >= 8 && hidden.length === 0, hidden.join(', '));
    await ctx.close();
  }
  // Map explorer renders (WebGL) or falls back.
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(() => sessionStorage.setItem('av-intro-shown', '1'));
    const page = await ctx.newPage();
    await page.goto(`${BASE}/geo`);
    const canvas = await page.locator('.maplibregl-canvas').waitFor({ timeout: 25_000 }).then(() => true, () => false);
    const fallback = await page.getByText(/does not support WebGL 2/).count();
    check('Map Explorer renders the map (or the documented fallback)', canvas || fallback > 0, canvas ? 'WebGL map' : 'SVG fallback');
    if (canvas) {
      await page.getByRole('button', { name: '2D map' }).click();
      await page.waitForTimeout(1000);
      check('Map Explorer 2D switch updates the shareable link', /m=2d/.test(page.url()));
    }
    await ctx.close();
  }
  // World Briefing loads events or explains why not.
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript(() => sessionStorage.setItem('av-intro-shown', '1'));
    const page = await ctx.newPage();
    await page.goto(`${BASE}/briefing`);
    await page.waitForTimeout(4000);
    const start = page.getByRole('button', { name: 'Start briefing' });
    const enabled = await start.isEnabled().catch(() => false);
    const empty = await page.getByText(/No events in this period/).count();
    check('World Briefing offers a tour or an honest empty state', enabled || empty > 0);
    if (enabled) {
      await start.click();
      check('World Briefing tour starts', (await page.getByText(/^Event 1 of \d+/).count()) === 1);
    }
    await ctx.close();
  }
  // Security headers on a page navigation.
  {
    const res = await fetch(`${BASE}/hq`);
    const h = (k: string) => res.headers.get(k) ?? '';
    check('CSP with frame-ancestors none', /frame-ancestors 'none'/.test(h('content-security-policy')), h('content-security-policy').slice(0, 120));
    check('X-Content-Type-Options nosniff', h('x-content-type-options') === 'nosniff');
    check('Referrer-Policy set', !!h('referrer-policy'), h('referrer-policy'));
    check('Strict transport (HSTS) on production', !BASE.includes('aurorav.app') || /max-age=\d+/.test(h('strict-transport-security')), h('strict-transport-security') || 'missing');
  }
}

const browser = await chromium.launch({ channel: process.env.CHROMIUM_PATH ? undefined : 'chrome', executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  await sweep(browser);
  await interactions(browser);
} finally {
  await browser.close();
}

writeFileSync('ui-audit-results.json', JSON.stringify({ base: BASE, at: new Date().toISOString(), widths: WIDTHS, routes: ROUTES, issues, checks }, null, 2));
const byKind = issues.reduce<Record<string, number>>((a, i) => ({ ...a, [i.kind]: (a[i.kind] ?? 0) + 1 }), {});
const failed = checks.filter((c) => !c.ok);
const summary = `${BASE}: ${ROUTES.length} routes × ${WIDTHS.length} widths; issues ${JSON.stringify(byKind)}; interaction checks ${checks.length - failed.length}/${checks.length} passed`;
console.log(summary);
if (process.env.GITHUB_ACTIONS) {
  console.log(`::notice title=UI audit::${summary}`);
  console.log(`::notice title=UI audit checks::${checks.map((c) => `${c.ok ? 'PASS' : 'FAIL'} ${c.name}${c.detail ? ` (${c.detail})` : ''}`).join(' | ')}`);
  // Group identical issues across widths so the annotations stay readable.
  const groups = new Map<string, number[]>();
  for (const i of issues) {
    const key = `${i.kind} ${i.route}: ${i.detail}`;
    groups.set(key, [...(groups.get(key) ?? []), i.width]);
  }
  let n = 0;
  for (const [key, widths] of groups) {
    if (n++ >= 45) break;
    console.log(`::warning title=UI audit ${key.split(':')[0]}::[${widths.join(',')}px] ${key.slice(key.indexOf(':') + 2)}`);
  }
}
for (const c of failed) console.log(`FAIL ${c.name} ${c.detail ?? ''}`);

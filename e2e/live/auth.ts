/**
 * Live end-to-end test of accounts on a real deployment (production or a PR preview) with the real Supabase project,
 * real email delivery and a real browser. Run by `.github/workflows/live-auth.yml`; never in unit tests.
 *
 *   BASE_URL=https://aurorav.app node e2e/live/auth.ts
 *
 * It creates two throwaway accounts on disposable inboxes (mail.tm), exercises sign-up, email confirmation, sign-in,
 * sync, notes, export, password reset, cross-account isolation (RLS) and account deletion, and deletes both accounts at
 * the end. Passwords, tokens, keys and email links are generated or read at run time and never printed.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';

const BASE = (process.env.BASE_URL ?? 'https://aurorav.app').replace(/\/+$/, '');
const HOST = new URL(BASE).host;

type Kind = 'browser' | 'api' | 'email';
interface Result {
  id: string;
  name: string;
  kind: Kind;
  status: 'pass' | 'fail' | 'skip';
  detail: string;
}
const results: Result[] = [];
/** Accounts created by this run, deleted at the end even if a check fails. */
const created: { email: string; pw: () => string }[] = [];

function record(id: string, name: string, kind: Kind, status: Result['status'], detail = '') {
  results.push({ id, name, kind, status, detail });
  const mark = status === 'pass' ? 'PASS' : status === 'fail' ? 'FAIL' : 'SKIP';
  console.log(`${mark} [${kind}] ${id} ${name}${detail ? `: ${detail}` : ''}`);
}

/** Thrown to record a check as skipped (with the reason) instead of failed. */
class Skip extends Error {}

/** True when the target is not production: Supabase only redirects email links to allow-listed origins. */
const IS_PREVIEW = !/^(www\.)?aurorav\.app$/.test(HOST);

/** Runs one check; an exception records a failure (message only) and the run continues. */
async function check(id: string, name: string, kind: Kind, fn: () => Promise<string | void>): Promise<boolean> {
  try {
    const detail = await fn();
    record(id, name, kind, 'pass', detail ?? '');
    return true;
  } catch (e) {
    if (e instanceof Skip) {
      record(id, name, kind, 'skip', e.message);
      return false;
    }
    record(id, name, kind, 'fail', why(e).split('\n')[0]!.slice(0, 300));
    return false;
  }
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const password = () => `Av-${randomBytes(18).toString('base64url')}`;

// ---------------------------------------------------------------------------------------------------------------
// Disposable inboxes (several free providers; the first that works from the runner is used)
interface RawMail {
  id: string;
  from: string;
  subject: string;
}
interface Inbox {
  provider: string;
  address: string;
  list: () => Promise<RawMail[]>;
  body: (id: string) => Promise<string>;
  seen: Set<string>;
}

function why(e: unknown): string {
  const err = e as Error & { cause?: { code?: string; message?: string } };
  return `${err.message}${err.cause ? ` (${err.cause.code ?? err.cause.message})` : ''}`;
}

async function getJson(url: string, init: RequestInit = {}, token?: string): Promise<unknown> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url, { ...init, headers: { 'content-type': 'application/json', accept: 'application/json', 'user-agent': 'aurora-veritatis-e2e', ...(token ? { authorization: `Bearer ${token}` } : {}) } });
    if (res.status === 429) {
      await sleep(1500 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new Error(`${new URL(url).host}${new URL(url).pathname}: HTTP ${res.status}`);
    return res.status === 204 ? null : res.json();
  }
  throw new Error('mail API rate limit');
}

/** Collection items from mail.tm in any of its formats: plain array, `member` (API Platform 4) or `hydra:member`. */
function members<T>(x: unknown): T[] {
  if (Array.isArray(x)) return x as T[];
  const o = (x ?? {}) as Record<string, unknown>;
  const list = o.member ?? o['hydra:member'];
  if (!Array.isArray(list)) throw new Error(`unexpected collection format: ${JSON.stringify(x).slice(0, 120)}`);
  return list as T[];
}

async function mailTm(api: string, tag: string): Promise<Inbox> {
  const domain = members<{ domain: string; isActive: boolean }>(await getJson(`${api}/domains`)).find((d) => d.isActive)?.domain;
  assert(domain, 'no active domain');
  const address = `av-e2e-${tag}-${randomBytes(5).toString('hex')}@${domain}`;
  const pw = password();
  await getJson(`${api}/accounts`, { method: 'POST', body: JSON.stringify({ address, password: pw }) });
  const { token } = (await getJson(`${api}/token`, { method: 'POST', body: JSON.stringify({ address, password: pw }) })) as { token: string };
  return {
    provider: new URL(api).host,
    address,
    seen: new Set(),
    list: async () =>
      members<{ id: string; from: { address: string }; subject: string }>(await getJson(`${api}/messages`, {}, token)).map((m) => ({ id: m.id, from: m.from.address, subject: m.subject })),
    body: async (id) => {
      const m = (await getJson(`${api}/messages/${id}`, {}, token)) as { html?: string[]; text?: string };
      return [...(m.html ?? []), m.text ?? ''].join('\n');
    },
  };
}

async function guerrilla(tag: string): Promise<Inbox> {
  const api = 'https://api.guerrillamail.com/ajax.php';
  let { sid_token: sid } = (await getJson(`${api}?f=get_email_address&lang=en`)) as { sid_token: string };
  const user = `av-e2e-${tag}-${randomBytes(5).toString('hex')}`;
  const set = (await getJson(`${api}?f=set_email_user&email_user=${user}&lang=en&sid_token=${sid}`)) as { email_addr: string; sid_token: string };
  sid = set.sid_token ?? sid;
  return {
    provider: 'guerrillamail.com',
    address: set.email_addr,
    seen: new Set(['1']),
    list: async () =>
      ((await getJson(`${api}?f=check_email&seq=0&sid_token=${sid}`)) as { list?: { mail_id: string; mail_from: string; mail_subject: string }[] }).list
        ?.filter((m) => !/guerrillamail/i.test(m.mail_from))
        .map((m) => ({ id: String(m.mail_id), from: m.mail_from, subject: m.mail_subject })) ?? [],
    body: async (id) => ((await getJson(`${api}?f=fetch_email&email_id=${id}&sid_token=${sid}`)) as { mail_body: string }).mail_body,
  };
}

async function createInbox(tag: string): Promise<Inbox> {
  const errors: string[] = [];
  const providers: [string, () => Promise<Inbox>][] = [
    ['mail.tm', () => mailTm('https://api.mail.tm', tag)],
    ['mail.gw', () => mailTm('https://api.mail.gw', tag)],
    ['guerrillamail', () => guerrilla(tag)],
  ];
  for (const [name, make] of providers) {
    try {
      return await make();
    } catch (e) {
      errors.push(`${name}: ${why(e)}`);
    }
  }
  throw new Error(`no disposable inbox available: ${errors.join('; ')}`);
}

interface Mail {
  from: string;
  subject: string;
  link: string;
}

/** Waits for the next unseen message and returns its sender, subject and the Supabase verification link. */
/** Real emails received during this run (reported in the summary to track the email budget). */
const emailLog: { subject: string; seconds: number }[] = [];

async function waitForMail(inbox: Inbox, timeoutMs = 240_000): Promise<Mail> {
  const started = Date.now();
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const next = (await inbox.list()).find((m) => !inbox.seen.has(m.id));
    if (next) {
      inbox.seen.add(next.id);
      const body = (await inbox.body(next.id)).replace(/&amp;/g, '&');
      const link = body.match(/https:\/\/[^\s"'<>]+\/auth\/v1\/verify\?[^\s"'<>]+/)?.[0];
      assert(link, `email "${next.subject}" has no verification link`);
      emailLog.push({ subject: next.subject, seconds: Math.round((Date.now() - started) / 1000) });
      return { from: next.from, subject: next.subject, link };
    }
    await sleep(5000);
  }
  throw new Error(`no email within ${timeoutMs / 1000} s`);
}

/** Describes a verification link without exposing its token. */
function describeLink(link: string): string {
  const u = new URL(link);
  const redirect = u.searchParams.get('redirect_to') ?? '';
  return `type=${u.searchParams.get('type')}, redirect_to=${redirect ? new URL(redirect).origin + new URL(redirect).pathname : 'none'}`;
}

// ---------------------------------------------------------------------------------------------------------------
// Browser helpers
const consoleErrors = new Map<Page, string[]>();

async function newPage(ctx: BrowserContext): Promise<Page> {
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text().slice(0, 200));
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 200)}`));
  consoleErrors.set(page, errors);
  return page;
}

async function noOverflow(page: Page): Promise<boolean> {
  return page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1') as Promise<boolean>;
}

async function registerViaUi(ctx: BrowserContext, email: string, pw: string): Promise<string> {
  const page = await newPage(ctx);
  await page.goto(`${BASE}/signin`);
  await page.getByRole('tab', { name: 'Register' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(pw);
  await page.getByRole('button', { name: 'Create account' }).click();
  const status = page.getByRole('status').filter({ hasText: /Account created/ });
  const alert = page.getByRole('alert');
  await status.or(alert).first().waitFor({ timeout: 20_000 });
  if (await alert.count()) throw new Error(`sign-up refused: "${((await alert.first().textContent()) ?? '').trim()}"`);
  const text = (await status.textContent()) ?? '';
  await page.close();
  return text;
}

async function signInViaUi(page: Page, email: string, pw: string) {
  await page.goto(`${BASE}/signin`);
  await page.getByRole('tab', { name: 'Password' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(pw);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

async function waitSignedIn(page: Page, email: string) {
  await page.waitForURL(/\/account/, { timeout: 30_000 });
  await page.getByText(email, { exact: true }).first().waitFor({ timeout: 30_000 });
}

async function waitSynced(page: Page) {
  await page.goto(`${BASE}/account`);
  await page.getByText(/Preferences synced/).waitFor({ timeout: 30_000 });
}

// ---------------------------------------------------------------------------------------------------------------
async function apiClient(url: string, key: string, email?: string, pw?: string): Promise<SupabaseClient> {
  const c = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  if (email && pw) {
    const { error } = await c.auth.signInWithPassword({ email, password: pw });
    if (error) throw new Error(`sign-in ${email.split('@')[0]}: ${error.message}`);
  }
  return c;
}

async function main() {
  console.log(`Live auth test against ${BASE}`);
  // 1. Public configuration and key exposure ------------------------------------------------------------------
  let sbUrl = '';
  let anonKey = '';
  await check('1', 'Worker exposes the public Supabase configuration', 'api', async () => {
    const cfg = (await (await fetch(`${BASE}/api/config`)).json()) as { supabase?: { url: string; anonKey: string } };
    assert(cfg.supabase, 'no supabase block in /api/config');
    sbUrl = cfg.supabase.url;
    anonKey = cfg.supabase.anonKey;
    assert(/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(sbUrl), 'URL is not a bare https://<ref>.supabase.co base URL');
    const role = anonKey.startsWith('sb_publishable_')
      ? 'publishable'
      : (JSON.parse(Buffer.from(anonKey.split('.')[1] ?? '', 'base64url').toString()) as { role?: string }).role ?? '';
    assert(role === 'anon' || role === 'publishable', `public key has role "${role}" (must be anon/publishable)`);
    const health = await fetch(`${sbUrl}/auth/v1/health`, { headers: { apikey: anonKey } });
    assert(health.ok, `auth health HTTP ${health.status}`);
    return `project ${new URL(sbUrl).host.split('.')[0]}, key role ${role}, auth health OK`;
  });
  if (!sbUrl) return;

  await check('S4', 'No privileged Supabase key in the served JavaScript', 'api', async () => {
    const html = await (await fetch(`${BASE}/`)).text();
    const queue = [...html.matchAll(/\/assets\/[^"'\s)]+\.js/g)].map((m) => m[0]);
    const seen = new Set<string>();
    while (queue.length && seen.size < 150) {
      const path = queue.shift()!;
      if (seen.has(path)) continue;
      seen.add(path);
      const js = await (await fetch(`${BASE}${path}`)).text();
      assert(!/sb_secret_[A-Za-z0-9_-]{20,}/.test(js), `${path} contains a secret API key`);
      for (const tok of js.match(/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) ?? []) {
        const role = (JSON.parse(Buffer.from(tok.split('.')[1]!, 'base64url').toString()) as { role?: string }).role;
        assert(role !== 'service_role', `${path} embeds a service_role JWT`);
      }
      for (const m of js.matchAll(/assets\/[A-Za-z0-9_.-]+\.js/g)) queue.push(`/${m[0]}`);
    }
    return `${seen.size} script files scanned`;
  });

  const browser: Browser = await chromium.launch({ channel: process.env.CHROMIUM_PATH ? undefined : 'chrome', executablePath: process.env.CHROMIUM_PATH || undefined });
  const desktop = { viewport: { width: 1280, height: 900 }, acceptDownloads: true };
  const mobile = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true };
  try {
    // 15. Guest experience -----------------------------------------------------------------------------------
    await check('15', 'Guest experience works without an account (desktop and 390 px)', 'browser', async () => {
      const notes: string[] = [];
      for (const opts of [desktop, mobile]) {
        const ctx = await browser.newContext(opts);
        for (const path of ['/', '/hq', '/radar', '/countries', '/markets', '/macro', '/brain', '/account']) {
          const page = await newPage(ctx);
          const res = await page.goto(`${BASE}${path}`, { waitUntil: 'load' });
          assert(res?.ok(), `${path} HTTP ${res?.status()}`);
          assert(new URL(page.url()).pathname === path, `${path} redirected to ${new URL(page.url()).pathname}`);
          await page.locator('h1').first().waitFor({ timeout: 15_000 });
          assert(await noOverflow(page), `${path} overflows horizontally at ${opts.viewport.width} px`);
          const errs = (consoleErrors.get(page) ?? []).filter((e) => !/Failed to load resource/.test(e));
          if (errs.length) notes.push(`${path}@${opts.viewport.width}: ${errs[0]}`);
          await page.close();
        }
        await ctx.close();
      }
      assert(!notes.length, `console errors: ${notes.join(' | ')}`);
      return '8 routes × 2 viewports, no redirects to sign-in, no overflow, no console errors';
    });

    await check('14c', 'Missing session: /account shows the guest state', 'browser', async () => {
      const ctx = await browser.newContext(desktop);
      const page = await newPage(ctx);
      await page.goto(`${BASE}/account`);
      await page.getByRole('heading', { name: 'Guest session' }).waitFor({ timeout: 15_000 });
      await page.getByRole('link', { name: 'Sign in' }).first().waitFor();
      await ctx.close();
    });

    // 2–5. Registration and confirmation -----------------------------------------------------------------------
    let inboxes: [Inbox, Inbox] | null = null;
    await check('M', 'Disposable test inboxes created', 'email', async () => {
      inboxes = [await createInbox('a'), await createInbox('b')];
      return `${inboxes[0].provider}, ${inboxes[0].address.split('@')[1]}`;
    });
    if (!inboxes) return;
    const [inboxA, inboxB] = inboxes as [Inbox, Inbox];
    const pwA = password();
    const pwB = password();
    let pwA2 = pwA;
    created.push({ email: inboxA.address, pw: () => pwA2 }, { email: inboxB.address, pw: () => pwB });

    const ctxA = await browser.newContext(desktop);
    await check('2', 'Browser creates the Supabase client (sign-in form enabled)', 'browser', async () => {
      const page = await newPage(ctxA);
      await page.goto(`${BASE}/signin`);
      await page.getByLabel('Email').waitFor();
      assert(await page.getByLabel('Email').isEnabled(), 'email field disabled: client not created');
      assert(!(await page.getByText('Accounts are not switched on yet').count()), 'page says accounts are off');
      const errs = consoleErrors.get(page) ?? [];
      assert(!errs.length, `console errors: ${errs[0]}`);
      await page.close();
    });

    const regA = await check('3', 'A new user can register (desktop UI)', 'browser', async () => registerViaUi(ctxA, inboxA.address, pwA));
    if (!regA) {
      record('—', 'Remaining account checks', 'browser', 'skip', 'sign-up did not complete (see check 3)');
      return;
    }
    let mailA: Mail | null = null;
    if (regA) {
      await check('4', 'Confirmation email is delivered', 'email', async () => {
        mailA = await waitForMail(inboxA);
        return `from ${mailA.from}, subject "${mailA.subject}"`;
      });
    }
    if (mailA) {
      const m: Mail = mailA;
      await check('5', 'Confirmation link returns to the right domain and signs in', 'browser', async () => {
        const redirect = new URL(new URL(m.link).searchParams.get('redirect_to') ?? 'about:blank');
        const page = await newPage(ctxA);
        if (redirect.host !== HOST && IS_PREVIEW) {
          // Preview origins are not in the Supabase redirect allow-list: the link confirms the address and then goes to
          // the Site URL. Confirm, then sign in on the preview with the password.
          await (await newPage(await browser.newContext(desktop))).goto(m.link);
          await signInViaUi(page, inboxA.address, pwA);
          await waitSignedIn(page, inboxA.address);
          await page.close();
          throw new Skip(`preview: link redirects to ${redirect.host} (Site URL); address confirmed, password sign-in on the preview works`);
        }
        assert(redirect.host === HOST, `redirect_to host is ${redirect.host}, expected ${HOST}`);
        await page.goto(m.link);
        await waitSignedIn(page, inboxA.address);
        await page.close();
        return describeLink(m.link);
      });
    }

    const ctxB = await browser.newContext(mobile);
    let bReady = false;
    if (await check('3b', 'Second user registers (390 px mobile UI)', 'browser', async () => registerViaUi(ctxB, inboxB.address, pwB))) {
      await check('4b', 'Second confirmation email delivered and confirmed', 'email', async () => {
        const mail = await waitForMail(inboxB);
        const page = await newPage(ctxB);
        if (new URL(new URL(mail.link).searchParams.get('redirect_to') ?? 'about:blank').host !== HOST && IS_PREVIEW) {
          await (await newPage(await browser.newContext(desktop))).goto(mail.link);
          await signInViaUi(page, inboxB.address, pwB);
        } else {
          await page.goto(mail.link);
        }
        await waitSignedIn(page, inboxB.address);
        assert(await noOverflow(page), '/account overflows at 390 px');
        await page.close();
        bReady = true;
        return `from ${mail.from}`;
      });
    }

    let a: SupabaseClient | null = null;
    let b: SupabaseClient | null = null;
    await check('8', 'Profile row is created automatically on sign-up', 'api', async () => {
      a = await apiClient(sbUrl, anonKey, inboxA.address, pwA);
      const { data, error } = await a.from('profiles').select('id, tier');
      assert(!error, error?.message ?? '');
      assert(data?.length === 1 && data[0]!.tier === 'free', `profiles visible to A: ${JSON.stringify(data)}`);
      return 'one profile, tier free';
    });
    if (bReady) b = await apiClient(sbUrl, anonKey, inboxB.address, pwB).catch(() => null);

    // 9–11. Preferences, notes and cross-device sync ------------------------------------------------------------
    const pageA = await newPage(ctxA);
    await check('9', 'Preferences are stored in the cloud from the UI', 'browser', async () => {
      await waitSynced(pageA);
      await pageA.goto(`${BASE}/hq`);
      await pageA.getByRole('button', { name: 'Remove GOLD.D' }).click();
      let watchlist: string[] | undefined;
      let cloudAt = '';
      for (let i = 0; i < 10; i++) {
        await sleep(1500);
        const { data, error } = await a!.from('user_preferences').select('data, updated_at');
        assert(!error, error?.message ?? '');
        watchlist = (data?.[0]?.data as { watchlist?: string[] } | undefined)?.watchlist;
        cloudAt = String(data?.[0]?.updated_at ?? '');
        if (Array.isArray(watchlist) && !watchlist.includes('GOLD.D')) break;
      }
      if (!Array.isArray(watchlist) || watchlist.includes('GOLD.D')) {
        // Diagnostics: what this browser holds and what the sync status says.
        const local = (await pageA.evaluate(
          'JSON.stringify({ w: JSON.parse(localStorage.getItem("av-prefs-v1") || "{}").state?.watchlist, at: localStorage.getItem("av-prefs-updated-at"), owner: !!localStorage.getItem("av-prefs-owner") })',
        )) as string;
        await pageA.goto(`${BASE}/account`);
        await sleep(3000);
        const status = ((await pageA.getByRole('status').first().textContent().catch(() => '')) ?? '').replace(/\s+/g, ' ').slice(0, 160);
        await pageA.goto(`${BASE}/hq`);
        throw new Error(`cloud watchlist ${JSON.stringify(watchlist)} (updated ${cloudAt}); browser ${local}; status "${status}"`);
      }
      return `cloud watchlist ${watchlist.join(', ')}`;
    });

    await check('10', 'Research notes are saved and edited from the UI', 'browser', async () => {
      await pageA.getByLabel('Note title').fill('E2E note');
      await pageA.getByLabel('Note body').fill('Created by the live test.');
      await pageA.getByRole('button', { name: 'Save note' }).click();
      await sleep(3000);
      let { data } = await a!.from('research_notes').select('id, title, body');
      assert(data?.length === 1 && data[0]!.title === 'E2E note', `after save: ${JSON.stringify(data)}`);
      await pageA.getByRole('button', { name: 'Edit note E2E note' }).click();
      await pageA.getByLabel('Note title').fill('E2E note edited');
      await pageA.getByRole('button', { name: 'Save changes' }).click();
      await sleep(3000);
      ({ data } = await a!.from('research_notes').select('id, title, body'));
      assert(data?.length === 1 && data[0]!.title === 'E2E note edited', `after edit: ${JSON.stringify(data)}`);
      return 'saved and edited';
    });

    await check('P1', 'Profile is edited from the Account page and persists', 'browser', async () => {
      await pageA.goto(`${BASE}/account`);
      const name = `E2E Profile ${randomBytes(2).toString('hex')}`;
      await pageA.getByLabel('Display name', { exact: true }).fill(name);
      await pageA.getByRole('button', { name: 'Save profile' }).click();
      await pageA.getByRole('status').filter({ hasText: 'Saved.' }).waitFor({ timeout: 15_000 });
      const { data } = await a!.from('profiles').select('display_name');
      assert(data?.[0]?.display_name === name, `stored display name: ${JSON.stringify(data)}`);
      await pageA.reload();
      await pageA.getByLabel('Display name', { exact: true }).waitFor({ timeout: 15_000 });
      await sleep(1500);
      assert((await pageA.getByLabel('Display name', { exact: true }).inputValue()) === name, 'display name not shown after reload');
      return 'saved, stored in the database, shown after reload';
    });

    await check('AD1', 'An ordinary user sees no administration at /admin', 'browser', async () => {
      await pageA.goto(`${BASE}/admin`);
      await pageA.getByText('Your account does not have the administrator role').waitFor({ timeout: 20_000 });
      assert(!(await pageA.getByRole('heading', { name: 'Accounts and plans' }).count()), 'admin dashboard rendered');
      assert(!(await pageA.getByText('Recent administrator actions').count()), 'audit log rendered');
      return 'refusal shown; no dashboard, user list or audit log';
    });

    const ctxA2 = await browser.newContext(mobile);
    await check('11', 'Data syncs to a second device and deletes from there', 'browser', async () => {
      const page = await newPage(ctxA2);
      await signInViaUi(page, inboxA.address, pwA);
      await waitSignedIn(page, inboxA.address);
      await waitSynced(page);
      await page.goto(`${BASE}/hq`);
      const note = page.getByRole('button', { name: /^Delete note E2E note/ });
      await note.waitFor({ timeout: 15_000 });
      assert(!(await page.getByRole('button', { name: 'Remove GOLD.D' }).count()), 'watchlist change did not sync to the second device');
      await note.click();
      await sleep(3000);
      const { data } = await a!.from('research_notes').select('id');
      assert(data?.length === 0, `notes left after delete: ${data?.length}`);
      await page.close();
      return 'watchlist and note arrived on a 390 px device; deletion reached the cloud';
    });

    await check('6', 'Sign-out clears the session and this browser’s copy', 'browser', async () => {
      const page = await newPage(ctxA2);
      await page.goto(`${BASE}/account`);
      await page.getByRole('button', { name: 'Sign out', exact: true }).click();
      await page.getByRole('heading', { name: 'Guest session' }).waitFor({ timeout: 15_000 });
      await page.reload();
      await page.getByRole('heading', { name: 'Guest session' }).waitFor({ timeout: 15_000 });
      const owner = await page.evaluate('localStorage.getItem("av-prefs-owner")');
      const prefs = JSON.parse(((await page.evaluate('localStorage.getItem("av-prefs-v1")')) as string | null) ?? '{}') as { state?: { watchlist?: string[] } };
      await page.close();
      assert(owner === null && prefs.state?.watchlist?.includes('GOLD.D'), 'the account’s local copy stayed in the browser after sign-out');
      return 'signed out; session and local account copy removed; still signed out after reload';
    });

    await check('14a', 'Invalid credentials show a clear error', 'browser', async () => {
      const page = await newPage(ctxA2);
      await signInViaUi(page, inboxA.address, `${pwA}x`);
      const alert = page.getByRole('alert').filter({ hasText: /invalid/i });
      await alert.waitFor({ timeout: 15_000 });
      const text = (await alert.textContent()) ?? '';
      await page.close();
      return `"${text.trim()}"`;
    });

    if (mailA) {
      const m: Mail = mailA;
      await check('14b', 'A used confirmation link is handled', 'browser', async () => {
        if (IS_PREVIEW) throw new Skip('preview: email links redirect to the Site URL');
        const ctx = await browser.newContext(desktop);
        const page = await newPage(ctx);
        await page.goto(m.link);
        const alert = page.getByRole('alert');
        await alert.first().waitFor({ timeout: 15_000 });
        const text = ((await alert.first().textContent()) ?? '').trim();
        await ctx.close();
        return `landed on ${new URL(page.url()).pathname}: "${text.slice(0, 140)}"`;
      });
    }

    // 7. Password reset ------------------------------------------------------------------------------------------
    await check('7', 'Password reset by email', 'email', async () => {
      const ctx = await browser.newContext(desktop);
      const page = await newPage(ctx);
      await page.goto(`${BASE}/signin`);
      await page.getByRole('tab', { name: 'Password' }).click();
      await page.getByRole('button', { name: 'Forgot password?' }).click();
      await page.getByLabel('Email').fill(inboxA.address);
      await page.getByRole('button', { name: 'Send reset link' }).click();
      await page.getByRole('status').filter({ hasText: /reset link/ }).waitFor({ timeout: 20_000 });
      const mail = await waitForMail(inboxA);
      const target = new URL(new URL(mail.link).searchParams.get('redirect_to') ?? 'about:blank').host;
      if (target !== HOST && IS_PREVIEW) throw new Skip(`preview: reset email delivered (from ${mail.from}), link redirects to ${target}`);
      assert(target === HOST, `reset link redirects to ${target}`);
      await page.goto(mail.link);
      await page.getByText('Set a new password').waitFor({ timeout: 30_000 });
      const next = password();
      await page.getByLabel('New password', { exact: true }).fill(next);
      await page.getByRole('button', { name: 'Update password' }).click();
      await page.getByText('Set a new password').waitFor({ state: 'detached', timeout: 15_000 });
      // From here the new password is the valid one, whatever happens next (cleanup depends on it).
      if (await apiClient(sbUrl, anonKey, inboxA.address, next).then(() => true, () => false)) pwA2 = next;
      await page.getByText('Password updated.').waitFor({ timeout: 15_000 });
      await page.getByRole('button', { name: 'Sign out', exact: true }).click();
      await page.getByRole('heading', { name: 'Guest session' }).waitFor({ timeout: 15_000 });
      await signInViaUi(page, inboxA.address, next);
      await waitSignedIn(page, inboxA.address);
      await ctx.close();
      return `from ${mail.from}, subject "${mail.subject}"; new password works`;
    });
    a = await apiClient(sbUrl, anonKey, inboxA.address, pwA2).catch(() => a);

    // RLS with two real accounts ----------------------------------------------------------------------------------
    if (a && b) {
      const A = a as SupabaseClient;
      const B = b as SupabaseClient;
      const idA = (await A.auth.getUser()).data.user!.id;
      const idB = (await B.auth.getUser()).data.user!.id;
      const { data: noteRows } = await A.from('research_notes').insert({ user_id: idA, title: 'A private' }).select('id');
      const noteId = noteRows?.[0]?.id as string | undefined;
      await check('S1a', 'B cannot read A’s profile, preferences or notes', 'api', async () => {
        const p = await B.from('profiles').select('id');
        const pr = await B.from('user_preferences').select('user_id').eq('user_id', idA);
        const n = await B.from('research_notes').select('id').eq('user_id', idA);
        assert(p.data?.length === 1 && p.data[0]!.id === idB, `profiles visible to B: ${p.data?.length}`);
        assert(pr.data?.length === 0 && n.data?.length === 0, 'B sees A rows');
        return 'B sees only its own profile; 0 of A’s rows';
      });
      await check('S1b', 'B cannot change or delete A’s rows', 'api', async () => {
        await B.from('research_notes').update({ title: 'changed by B' }).eq('id', noteId!);
        await B.from('research_notes').delete().eq('id', noteId!);
        await B.from('profiles').update({ display_name: 'B was here' }).eq('id', idA);
        await B.from('user_preferences').delete().eq('user_id', idA);
        const ins = await B.from('research_notes').insert({ user_id: idA, title: 'planted' });
        const up = await B.from('user_preferences').upsert({ user_id: idA, data: {} });
        assert(ins.error && up.error, 'B could write rows for A');
        const n = await A.from('research_notes').select('title').eq('id', noteId!);
        const pr = await A.from('user_preferences').select('user_id');
        const p = await A.from('profiles').select('display_name').eq('id', idA);
        assert(n.data?.[0]?.title === 'A private', 'A’s note was changed or deleted');
        assert(pr.data?.length === 1, 'A’s preferences were deleted');
        assert(p.data?.[0]?.display_name !== 'B was here', 'A’s profile was renamed');
        return `insert refused (${ins.error.code}), upsert refused (${up.error.code}); updates and deletes affected 0 rows`;
      });
      await check('S2', 'Users cannot change their own plan tier', 'api', async () => {
        const r = await A.from('profiles').update({ tier: 'intelligence' }).eq('id', idA).select('tier');
        const p = await A.from('profiles').select('tier').eq('id', idA);
        assert(p.data?.[0]?.tier === 'free', `tier is now ${p.data?.[0]?.tier}`);
        assert(r.error, 'update did not return an error');
        const ok = await A.from('profiles').update({ display_name: 'E2E A' }).eq('id', idA).select('display_name');
        assert(ok.data?.[0]?.display_name === 'E2E A', 'display name update failed');
        return `refused (${r.error.code}); display name still editable`;
      });
      await check('S3', 'Guests cannot read private records or call account functions', 'api', async () => {
        const anon = await apiClient(sbUrl, anonKey);
        for (const t of ['profiles', 'user_preferences', 'research_notes']) {
          const r = await anon.from(t).select('*').limit(1);
          assert(r.error || r.data?.length === 0, `${t} readable by guests`);
        }
        const rpc = await anon.rpc('delete_my_account');
        assert(rpc.error, 'guest could call delete_my_account');
        return `tables and delete_my_account refused (${rpc.error.code})`;
      });
      await check('S6', 'Ordinary users cannot call administrator functions', 'api', async () => {
        const calls: [string, Record<string, unknown>][] = [
          ['admin_stats', {}],
          ['admin_list_users', { search: '', lim: 10, off: 0 }],
          ['admin_grants', { target: null, lim: 10 }],
          ['admin_audit_log', { lim: 10 }],
          ['admin_grant_plan', { target: idA, new_tier: 'intelligence', expires: null, why: 'self-escalation attempt' }],
          ['admin_grant_plan', { target: idB, new_tier: 'free', expires: null, why: 'attack on another user' }],
          ['admin_revoke_grant', { grant_id: '00000000-0000-0000-0000-000000000000', why: 'attempt' }],
        ];
        const codes: string[] = [];
        for (const [fn, args] of calls) {
          const r = await A.rpc(fn, args);
          assert(r.error, `${fn} succeeded for an ordinary user`);
          assert(r.error.code === '42501', `${fn} failed with ${r.error.code} instead of 42501 (permission)`);
          codes.push(r.error.code);
        }
        const e = await A.rpc('my_entitlements');
        assert((e.data as { tier?: string } | null)?.tier === 'free', `tier after attempts: ${JSON.stringify(e.data)}`);
        return `${codes.length} calls refused with 42501; tier still free`;
      });
      await check('S6b', 'Administrator tables are not reachable through the API', 'api', async () => {
        const anon = await apiClient(sbUrl, anonKey);
        const out: string[] = [];
        for (const [who, c] of [['A', A], ['guest', anon]] as const) {
          for (const t of ['admins', 'plan_grants', 'admin_audit']) {
            const r = await c.schema('aurora_private').from(t).select('*').limit(1);
            const rows = (r.data as unknown[] | null) ?? [];
            assert(r.error && rows.length === 0, `${who} read aurora_private.${t}`);
            out.push(r.error.code ?? '?');
          }
        }
        return `6 reads refused (${[...new Set(out)].join(', ')})`;
      });
      await check('S7', 'Plan entitlements come from the server (Free, not admin, payments off)', 'api', async () => {
        const r = await A.rpc('my_entitlements');
        assert(!r.error, r.error?.message ?? '');
        const e = r.data as { tier: string; is_admin: boolean; payments: string; grant: unknown; limits: { researchNotes: number } };
        assert(e.tier === 'free' && e.is_admin === false && e.payments === 'disabled' && e.grant === null, JSON.stringify(e));
        assert(e.limits.researchNotes === 25, `notes limit ${e.limits.researchNotes}`);
        const anon = await apiClient(sbUrl, anonKey);
        const g = await anon.rpc('my_entitlements');
        const gs = await anon.rpc('admin_stats');
        assert(g.error && gs.error, 'guests could call entitlement or admin functions');
        return `tier free, is_admin false, payments disabled, 25 notes; guests refused (${g.error.code}, ${gs.error.code})`;
      });
      // Migrations 2026-10-24 (sessions, subscriptions, organisations) and 2026-10-25 (AI gateway): read-only checks.
      await check('M1', 'Sessions, subscription, organisation and AI usage functions work for an ordinary user', 'api', async () => {
        const st = await A.rpc('session_status');
        assert(!st.error && (st.data as { active?: boolean } | null)?.active === true, `session_status: ${st.error?.message ?? JSON.stringify(st.data)}`);
        const ss = await A.rpc('my_sessions');
        assert(!ss.error && Array.isArray(ss.data) && ss.data.length >= 1, `my_sessions: ${ss.error?.message ?? JSON.stringify(ss.data)}`);
        const sub = await A.rpc('my_subscription');
        assert(!sub.error, `my_subscription: ${sub.error?.message}`);
        const org = await A.rpc('my_organization');
        assert(!org.error && org.data == null, `my_organization: ${org.error?.message ?? JSON.stringify(org.data)}`);
        const ai = await A.rpc('my_ai_usage');
        const u = ai.data as { enabled?: boolean; used_today?: number; limit_today?: number } | null;
        assert(!ai.error && u && typeof u.enabled === 'boolean' && typeof u.limit_today === 'number', `my_ai_usage: ${ai.error?.message ?? JSON.stringify(ai.data)}`);
        return `session active, ${ss.data.length} session(s) listed, subscription ${sub.data ? 'present' : 'none'}, no organisation; AI ${u.enabled ? 'switched on' : 'switched off'}, Free limit ${u.limit_today}/day`;
      });
      await check('M2', 'Ordinary users cannot call the new administrator functions', 'api', async () => {
        const calls: [string, Record<string, unknown>][] = [
          ['admin_ai_overview', {}],
          ['admin_set_ai_settings', { on_off: true, budget_cents: 100000, limits: { free: 9999, premium: 9999, prime: 9999, intelligence: 9999 } }],
          ['admin_expiring', { days: 14 }],
          ['admin_list_orgs', {}],
          ['admin_set_session_policy', { single_session: true }],
          ['admin_start_subscription', { target: idA, new_tier: 'intelligence', months: 12, sub_kind: 'complimentary', why: 'self-escalation attempt' }],
        ];
        const codes: string[] = [];
        for (const [fn, args] of calls) {
          const r = await A.rpc(fn, args);
          assert(r.error, `${fn} succeeded for an ordinary user`);
          codes.push(r.error.code ?? '?');
        }
        const e = await A.rpc('my_entitlements');
        assert((e.data as { tier?: string } | null)?.tier === 'free', `tier after attempts: ${JSON.stringify(e.data)}`);
        return `${calls.length} calls refused (${[...new Set(codes)].join(', ')}); tier still free`;
      });
      // EVE through the real gateway. A real (paid) provider request is made only when AI_LIVE_TEST=1 and AI is
      // switched on; otherwise the check confirms the gate and makes no provider call.
      await check('AI1', 'EVE answers through the gateway with usage recorded (at most one real request)', 'api', async () => {
        const token = (await A.auth.getSession()).data.session?.access_token;
        assert(token, 'no session token');
        const before = ((await A.rpc('my_ai_usage')).data as { enabled?: boolean; used_today?: number } | null) ?? {};
        if (!before.enabled) {
          const r = await fetch(`${BASE}/api/ai/ask`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ assistant: 'eve', question: 'What does GDP measure?' }) });
          const j = (await r.json().catch(() => ({}))) as { reason?: string };
          assert(r.status === 429 && /switched off/i.test(j.reason ?? ''), `expected the "switched off" refusal, got ${r.status} ${JSON.stringify(j)}`);
          throw new Skip('AI is switched off in /admin → AI: the gateway refused correctly and made no provider call');
        }
        if (process.env.AI_LIVE_TEST !== '1') throw new Skip('AI is on; the paid test request runs only with AI_LIVE_TEST=1');
        const r = await fetch(`${BASE}/api/ai/ask`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ assistant: 'eve', question: 'In one short sentence: what does GDP measure?' }),
        });
        const j = (await r.json().catch(() => ({}))) as { answer?: string; provider?: string; model?: string; fallback?: boolean; usage?: { tokensIn?: number; tokensOut?: number }; error?: string };
        assert(r.ok && j.answer, `ask failed: ${r.status} ${j.error ?? ''}`);
        const after = ((await A.rpc('my_ai_usage')).data as { used_today?: number } | null) ?? {};
        assert((after.used_today ?? 0) > (before.used_today ?? 0), `usage not recorded: ${before.used_today} → ${after.used_today}`);
        const tin = j.usage?.tokensIn ?? 0;
        const tout = j.usage?.tokensOut ?? 0;
        // gpt-4o-mini list price $0.15 / $0.60 per million tokens.
        const usd = j.provider === 'openai' ? (tin * 0.15 + tout * 0.6) / 1e6 : 0;
        return `${j.provider} ${j.model}${j.fallback ? ' (fallback)' : ''}: ${tin} in + ${tout} out tokens ≈ $${usd.toFixed(6)}; usage recorded (${before.used_today ?? 0} → ${after.used_today})`;
      });
    } else {
      record('S1', 'Two-account RLS tests', 'api', 'skip', 'second account not available');
    }

    // 12. Export -------------------------------------------------------------------------------------------------
    const ctxA3 = await browser.newContext(desktop);
    const pageA3 = await newPage(ctxA3);
    await check('12', 'The account can export its data', 'browser', async () => {
      await signInViaUi(pageA3, inboxA.address, pwA2);
      await waitSignedIn(pageA3, inboxA.address);
      await waitSynced(pageA3);
      const [download] = await Promise.all([pageA3.waitForEvent('download'), pageA3.getByRole('button', { name: /^Export/ }).click()]);
      const file = await download.path();
      const json = JSON.parse(readFileSync(file, 'utf8')) as { account?: { email?: string; notes?: unknown[]; profile?: { tier?: string } }; browser?: unknown; watchlist?: unknown };
      assert(json.account, 'export has no account section');
      assert(json.account.email === inboxA.address, 'export has the wrong account');
      assert(Array.isArray(json.account.notes) && json.account.profile?.tier === 'free', 'export lacks cloud notes or profile');
      return `account export with profile, preferences and ${json.account.notes.length} cloud note(s)`;
    });

    // 13. Deletion -------------------------------------------------------------------------------------------------
    await check('13', 'Account deletion removes the account and its records', 'browser', async () => {
      if (!a) throw new Skip('first account not available');
      const A = a as SupabaseClient;
      const idA = (await A.auth.getUser()).data.user!.id;
      await pageA3.goto(`${BASE}/account`);
      pageA3.once('dialog', (d) => void d.accept());
      await pageA3.getByLabel('Confirm your password').fill(pwA2);
      await pageA3.getByRole('button', { name: 'Delete my account' }).click();
      await pageA3.getByRole('heading', { name: 'Guest session' }).waitFor({ timeout: 20_000 });
      const relogin = await apiClient(sbUrl, anonKey, inboxA.address, pwA2).then(() => 'still signs in', (e: Error) => e.message);
      assert(/invalid/i.test(relogin), `after deletion: ${relogin}`);
      if (b) {
        const B = b as SupabaseClient;
        const p = await B.from('profiles').select('id');
        assert(p.data?.length === 1, 'B’s profile was affected');
      }
      return `A (${idA.slice(0, 8)}…) can no longer sign in; B unaffected`;
    });

    // Clean up B and check the recent-sign-in rule on the way.
    if (b) {
      await check('S5', 'Second account deleted (cleanup)', 'api', async () => {
        const fresh = await apiClient(sbUrl, anonKey, inboxB.address, pwB);
        const { error } = await fresh.rpc('delete_my_account');
        assert(!error, error?.message ?? '');
        const relogin = await apiClient(sbUrl, anonKey, inboxB.address, pwB).then(() => 'still signs in', (e: Error) => e.message);
        assert(/invalid/i.test(relogin), `after deletion: ${relogin}`);
        return 'deleted with a fresh sign-in';
      });
    }
    await ctxA.close();
    await ctxB.close();
    await ctxA2.close();
    await ctxA3.close();
  } finally {
    await browser.close();
    // Best-effort cleanup of anything a failed check left behind.
    for (const acc of created) {
      const c = await apiClient(sbUrl, anonKey, acc.email, acc.pw()).catch(() => null);
      if (c) {
        const { error } = await c.rpc('delete_my_account');
        console.log(`Cleanup: ${acc.email.split('@')[0]} ${error ? `not deleted (${error.message})` : 'deleted'}`);
      }
    }
  }
}

main()
  .catch((e: Error) => record('X', 'Unexpected error', 'api', 'fail', why(e)))
  .finally(() => {
    const failed = results.filter((r) => r.status === 'fail');
    const passed = results.filter((r) => r.status === 'pass').length;
    const skipped = results.length - passed - failed.length;
    const lines = [`### Live auth test: ${BASE}`, '', `${passed} passed, ${failed.length} failed, ${results.length - passed - failed.length} skipped`, '', '| # | Check | Kind | Result | Detail |', '|---|---|---|---|---|', ...results.map((r) => `| ${r.id} | ${r.name} | ${r.kind} | ${r.status} | ${r.detail.replace(/\|/g, '/')} |`)];
    const mails = `Real emails received: ${emailLog.length}${emailLog.length ? ` (${emailLog.map((m) => `"${m.subject}" after ${m.seconds} s`).join(', ')})` : ''}`;
    lines.push('', mails);
    writeFileSync('live-auth-results.json', JSON.stringify({ base: BASE, at: new Date().toISOString(), results, emails: emailLog }, null, 2));
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
    const all = results.map((r) => `${r.status.toUpperCase()} [${r.kind}] ${r.id} ${r.name}${r.detail ? `: ${r.detail}` : ''}`).join('%0A');
    console.log(`::notice title=Live auth results::${BASE}: ${passed} passed, ${failed.length} failed, ${skipped} skipped. ${mails}%0A${all}`);
    for (const f of failed) console.log(`::error title=Live auth ${f.id}::${f.name}: ${f.detail}`);
    process.exit(failed.length ? 1 : 0);
  });

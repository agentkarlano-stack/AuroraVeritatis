import { RateLimiter } from './ratelimit';

/**
 * Brevo newsletter integration for Aurora Veritatis only (server side; the key never reaches the browser).
 *
 * - Subscribing uses Brevo's double opt-in: Brevo emails a confirmation link, and the address joins the Aurora list
 *   only after the person confirms. Brevo records the confirmation as consent evidence.
 * - Unsubscribe and deletion requests are confirmed through a signed, expiring link sent to the address, so nobody
 *   can remove someone else's subscription. Every marketing email from Brevo also carries Brevo's own unsubscribe link.
 * - Deletion removes the address from the Aurora list and deletes the contact only when it belongs to no other list
 *   (the Brevo account may hold other brands' lists, which Aurora never touches).
 * Authentication emails (Supabase + Resend) are separate and unchanged.
 */

export interface BrevoEnv {
  BREVO_API_KEY?: string;
  /** Numeric id of the Aurora Veritatis newsletter list. */
  BREVO_LIST_ID?: string;
  /** Numeric id of the double opt-in confirmation template (must contain {{ params.DOIurl }}). */
  BREVO_DOI_TEMPLATE_ID?: string;
  /** Verified sender for unsubscribe/deletion confirmation emails. */
  BREVO_SENDER_EMAIL?: string;
  BREVO_SENDER_NAME?: string;
  /** Optional separate signing secret for confirmation links (defaults to a key derived from BREVO_API_KEY). */
  NEWSLETTER_SIGNING_SECRET?: string;
}

const BASE = 'https://api.brevo.com/v3';
const LINK_TTL_MS = 48 * 3_600_000;

export const brevoStatus = (env: BrevoEnv) => {
  const listId = Number(env.BREVO_LIST_ID);
  const templateId = Number(env.BREVO_DOI_TEMPLATE_ID);
  return {
    configured: !!env.BREVO_API_KEY?.trim(),
    listConfigured: Number.isInteger(listId) && listId > 0,
    doubleOptInConfigured: Number.isInteger(templateId) && templateId > 0,
    senderConfigured: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.BREVO_SENDER_EMAIL ?? ''),
  };
};
export const subscriptionsReady = (env: BrevoEnv) => {
  const s = brevoStatus(env);
  return s.configured && s.listConfigured && s.doubleOptInConfigured;
};

export class BrevoError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const EMAIL = /^[^\s@<>()[\],;:"]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/;
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const e = raw.trim().toLowerCase();
  return e.length <= 254 && EMAIL.test(e) ? e : null;
}

async function call<T>(env: BrevoEnv, method: string, path: string, body?: unknown): Promise<T | null> {
  const key = env.BREVO_API_KEY?.trim();
  if (!key) throw new BrevoError('Newsletter is not configured', 503);
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: { 'api-key': key, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new BrevoError('Newsletter service unreachable', 502);
  }
  if (res.status === 204) return null;
  const data = (await res.json().catch(() => null)) as (T & { code?: string; message?: string }) | null;
  if (!res.ok) {
    const msg = (data?.message ?? `HTTP ${res.status}`).split(key).join('[redacted]');
    throw new BrevoError(`Brevo: ${msg}`, res.status === 404 ? 404 : res.status === 429 ? 503 : 502);
  }
  return data;
}

/** Starts double opt-in: Brevo sends the confirmation email; the contact joins the list only after confirming. */
export async function startDoubleOptIn(env: BrevoEnv, email: string, redirectionUrl: string): Promise<void> {
  await call(env, 'POST', '/contacts/doubleOptinConfirmation', {
    email,
    includeListIds: [Number(env.BREVO_LIST_ID)],
    templateId: Number(env.BREVO_DOI_TEMPLATE_ID),
    redirectionUrl,
  });
}

/** Removes the address from the Aurora list (other lists untouched). Unknown addresses are not an error. */
export async function unsubscribe(env: BrevoEnv, email: string): Promise<void> {
  try {
    await call(env, 'POST', `/contacts/lists/${Number(env.BREVO_LIST_ID)}/contacts/remove`, { emails: [email] });
  } catch (e) {
    if (!(e instanceof BrevoError && (e.status === 404 || /not exist|not found|already removed/i.test(e.message)))) throw e;
  }
}

/** GDPR deletion for Aurora: leave the Aurora list; delete the contact only if it is on no other list. */
export async function eraseForAurora(env: BrevoEnv, email: string): Promise<'deleted' | 'removed-from-list' | 'not-found'> {
  let contact: { listIds?: number[] } | null;
  try {
    contact = await call<{ listIds?: number[] }>(env, 'GET', `/contacts/${encodeURIComponent(email)}`);
  } catch (e) {
    if (e instanceof BrevoError && e.status === 404) return 'not-found';
    throw e;
  }
  const others = (contact?.listIds ?? []).filter((id) => id !== Number(env.BREVO_LIST_ID));
  if (others.length === 0) {
    await call(env, 'DELETE', `/contacts/${encodeURIComponent(email)}`);
    return 'deleted';
  }
  await unsubscribe(env, email);
  return 'removed-from-list';
}

// ---------- Signed confirmation links ----------

export type LinkAction = 'unsubscribe' | 'delete';
const enc = new TextEncoder();
const b64url = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function hmac(env: BrevoEnv, message: string): Promise<string> {
  const secret = env.NEWSLETTER_SIGNING_SECRET?.trim() || `aurora-newsletter:${env.BREVO_API_KEY ?? ''}`;
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}

export async function signLink(env: BrevoEnv, action: LinkAction, email: string, now = Date.now()): Promise<{ e: string; a: LinkAction; x: string; t: string }> {
  const x = String(now + LINK_TTL_MS);
  return { e: email, a: action, x, t: await hmac(env, `${action}|${email}|${x}`) };
}

/** Constant-time comparison of the expected and given tokens; also rejects expired links. */
export async function verifyLink(env: BrevoEnv, p: { e: string; a: string; x: string; t: string }, now = Date.now()): Promise<boolean> {
  if ((p.a !== 'unsubscribe' && p.a !== 'delete') || !normalizeEmail(p.e) || !/^\d{10,16}$/.test(p.x) || Number(p.x) < now) return false;
  const expected = await hmac(env, `${p.a}|${p.e}|${p.x}`);
  if (expected.length !== p.t.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ p.t.charCodeAt(i);
  return diff === 0;
}

/** Sends the confirmation email for an unsubscribe or deletion request (Brevo transactional email). */
export async function sendConfirmation(env: BrevoEnv, origin: string, action: LinkAction, email: string): Promise<void> {
  const p = await signLink(env, action, email);
  const link = `${origin}/api/newsletter/confirm?${new URLSearchParams(p).toString()}`;
  const what = action === 'delete' ? 'delete your newsletter data held by Aurora Veritatis' : 'unsubscribe from the Aurora Veritatis newsletter';
  await call(env, 'POST', '/smtp/email', {
    sender: { email: env.BREVO_SENDER_EMAIL, name: env.BREVO_SENDER_NAME || 'Aurora Veritatis' },
    to: [{ email }],
    subject: action === 'delete' ? 'Confirm deletion of your newsletter data' : 'Confirm your unsubscribe request',
    textContent: `Someone (hopefully you) asked to ${what}.\n\nConfirm within 48 hours:\n${link}\n\nIf you did not ask for this, ignore this email; nothing will change.\n\nAurora Veritatis, https://aurorav.app`,
    htmlContent: `<p>Someone (hopefully you) asked to ${what}.</p><p><a href="${link}">Confirm</a> (valid for 48 hours).</p><p>If you did not ask for this, ignore this email; nothing will change.</p><p>Aurora Veritatis · <a href="https://aurorav.app">aurorav.app</a></p>`,
    tags: ['aurora-newsletter-confirmation'],
  });
}

// ---------- Abuse protection ----------

const perIp = new RateLimiter(5, 5 / 3600); // 5 newsletter requests per hour per IP (burst 5)
const perEmail = new Map<string, number>();
/** One request per address per 10 minutes, five per IP per hour (per isolate; best effort). */
export function allowRequest(ip: string, email: string, now = Date.now()): boolean {
  if (!perIp.allow(`nl:${ip}`, now)) return false;
  const last = perEmail.get(email);
  if (last && now - last < 10 * 60_000) return false;
  if (perEmail.size > 5000) perEmail.clear();
  perEmail.set(email, now);
  return true;
}

export interface BrevoDiagnostics {
  plan: string | null;
  domains: { domain: string; authenticated: boolean; verified: boolean }[];
  listFound: boolean | null;
  checkedAt: string;
}

/** Account plan type, sender-domain authentication and whether the Aurora list exists. No contact data. */
export async function brevoDiagnostics(env: BrevoEnv, now = Date.now()): Promise<BrevoDiagnostics> {
  const account = await call<{ plan?: { type?: string }[] }>(env, 'GET', '/account');
  const domains = await call<{ domains?: { domain_name: string; authenticated?: boolean; verified?: boolean }[] }>(env, 'GET', '/senders/domains').catch(() => null);
  let listFound: boolean | null = null;
  if (brevoStatus(env).listConfigured) {
    listFound = await call(env, 'GET', `/contacts/lists/${Number(env.BREVO_LIST_ID)}`)
      .then(() => true)
      .catch((e: BrevoError) => (e.status === 404 ? false : null));
  }
  return {
    plan: account?.plan?.map((p) => p.type).filter(Boolean).join(', ') || null,
    domains: (domains?.domains ?? []).map((d) => ({ domain: d.domain_name, authenticated: !!d.authenticated, verified: !!d.verified })),
    listFound,
    checkedAt: new Date(now).toISOString(),
  };
}

// ---------- Business quote requests ----------

/** Inbox that receives business quote requests (owner-configurable; defaults to the support address). */
export const quoteInbox = (env: BrevoEnv & { BUSINESS_QUOTE_TO?: string }) => normalizeEmail(env.BUSINESS_QUOTE_TO) ?? 'auroraveritatissup@gmail.com';

/**
 * Emails a quote request to the team (Brevo transactional). The requester gets no automatic email, so the form cannot
 * be used to send mail to third parties; replies go to the requester through reply-to.
 * The sender falls back to an address on aurorav.app, whose domain is authenticated in Brevo.
 */
export async function sendQuoteRequest(env: BrevoEnv & { BUSINESS_QUOTE_TO?: string }, mail: { subject: string; text: string; html: string }, replyTo: { email: string; name: string }, reference: string): Promise<void> {
  await call(env, 'POST', '/smtp/email', {
    sender: { email: normalizeEmail(env.BREVO_SENDER_EMAIL) ?? 'business@aurorav.app', name: 'Aurora Veritatis Business' },
    to: [{ email: quoteInbox(env) }],
    replyTo,
    subject: mail.subject,
    textContent: mail.text,
    htmlContent: mail.html,
    headers: { 'X-Aurora-Reference': reference },
    tags: ['aurora-business-quote'],
  });
}

const quoteIp = new RateLimiter(3, 3 / 3600); // 3 quote requests per hour per IP
/** Three quote requests per IP per hour (per isolate; best effort). */
export const allowQuote = (ip: string, now = Date.now()) => quoteIp.allow(`q:${ip}`, now);

/**
 * Business & Institutional quote requests: field options and validation shared by the form and the Worker.
 * Aurora publishes no business prices; requests go to the team, which answers with a private proposal.
 */

export const SEAT_OPTIONS = ['3', '5', '10', '20', '50', '100+', 'custom'] as const;
export const INDUSTRIES = ['University or research institute', 'Consulting', 'Financial services', 'Corporate intelligence or risk', 'Media and journalism', 'Public sector or NGO', 'Energy, commodities or logistics', 'Other'] as const;
export const FUNCTIONS = ['Global Radar and briefings', 'Map Explorer and geospatial layers', 'Country dossiers and comparisons', 'Market Terminal and charts', 'Macro, FX and currency research', 'Quant Research', 'Personal Intelligence Brain and research workspaces', 'AI research assistants (planned)', 'Voice briefings (planned)', 'API or data export (planned)', 'Custom data or integrations'] as const;
export const AI_USAGE = ['None', 'Light (occasional summaries)', 'Moderate (daily use by several people)', 'Heavy (continuous research and reports)', 'Not sure yet'] as const;
export const DURATIONS = ['Monthly', '12 months', '24 months or longer', 'Not sure yet'] as const;

export interface QuoteRequest {
  organization: string;
  contact: string;
  email: string;
  country: string;
  industry: string;
  seats: string;
  customSeats?: string;
  functions: string[];
  aiUsage: string;
  duration: string;
  details?: string;
  consent: boolean;
}

const EMAIL = /^[^\s@<>()[\],;:"]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/;
/** Free-mail domains are accepted (small teams and universities use them) but flagged for the reviewer. */
const FREE_MAIL = /@(gmail|googlemail|yahoo|outlook|hotmail|live|icloud|gmx|web|proton|protonmail|aol)\./i;
// eslint-disable-next-line no-control-regex -- strips control characters from untrusted input
const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max) : '');

/** Validates and normalises an untrusted request. Returns the clean request or the first problem, in plain words. */
export function validateQuote(raw: unknown): { ok: true; value: QuoteRequest; freeMail: boolean } | { ok: false; error: string } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const organization = clean(r.organization, 160);
  const contact = clean(r.contact, 120);
  const email = clean(r.email, 254).toLowerCase();
  const country = clean(r.country, 80);
  const industry = clean(r.industry, 80);
  const seats = clean(r.seats, 10);
  const customSeats = clean(r.customSeats, 40);
  const aiUsage = clean(r.aiUsage, 80);
  const duration = clean(r.duration, 40);
  const details = clean(r.details, 3000);
  const functions = Array.isArray(r.functions) ? [...new Set(r.functions.map((f) => clean(f, 80)))].filter((f) => (FUNCTIONS as readonly string[]).includes(f)) : [];
  if (organization.length < 2) return { ok: false, error: 'Please enter the organisation name.' };
  if (contact.length < 2) return { ok: false, error: 'Please enter a contact person.' };
  if (!EMAIL.test(email)) return { ok: false, error: 'Please enter a valid business email address.' };
  if (country.length < 2) return { ok: false, error: 'Please choose a country.' };
  if (!(INDUSTRIES as readonly string[]).includes(industry)) return { ok: false, error: 'Please choose an industry.' };
  if (!(SEAT_OPTIONS as readonly string[]).includes(seats)) return { ok: false, error: 'Please choose the estimated number of users.' };
  if (seats === 'custom' && !customSeats) return { ok: false, error: 'Please describe the number of users you need.' };
  if (functions.length === 0) return { ok: false, error: 'Please choose at least one area you need.' };
  if (!(AI_USAGE as readonly string[]).includes(aiUsage)) return { ok: false, error: 'Please choose the expected AI usage.' };
  if (!(DURATIONS as readonly string[]).includes(duration)) return { ok: false, error: 'Please choose a preferred contract duration.' };
  if (r.consent !== true) return { ok: false, error: 'Please agree that we may contact you about this request.' };
  return {
    ok: true,
    value: { organization, contact, email, country, industry, seats, ...(seats === 'custom' ? { customSeats } : {}), functions, aiUsage, duration, ...(details ? { details } : {}), consent: true },
    freeMail: FREE_MAIL.test(email),
  };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** The internal notification email (plain text and escaped HTML). Never includes prices. */
export function quoteEmail(q: QuoteRequest, meta: { freeMail: boolean; receivedAt: string; reference: string }): { subject: string; text: string; html: string } {
  const rows: [string, string][] = [
    ['Reference', meta.reference],
    ['Received', meta.receivedAt],
    ['Organisation', q.organization],
    ['Contact', q.contact],
    ['Email', `${q.email}${meta.freeMail ? ' (free-mail address)' : ''}`],
    ['Country', q.country],
    ['Industry', q.industry],
    ['Users', q.seats === 'custom' ? `Custom: ${q.customSeats}` : q.seats],
    ['Functionality', q.functions.join('; ')],
    ['Expected AI usage', q.aiUsage],
    ['Contract duration', q.duration],
    ['Additional requirements', q.details ?? '(none)'],
  ];
  return {
    subject: `Business quote request: ${q.organization} (${q.seats === 'custom' ? 'custom' : q.seats} users) [${meta.reference}]`,
    text: `${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\nReply to this email to answer the requester. Prepare the proposal with the internal quotation calculator; do not quote list discounts.`,
    html: `<table cellpadding="6" style="border-collapse:collapse;font-family:sans-serif;font-size:14px">${rows.map(([k, v]) => `<tr><th align="left" valign="top" style="color:#555">${esc(k)}</th><td style="white-space:pre-wrap">${esc(v)}</td></tr>`).join('')}</table><p style="font-family:sans-serif;font-size:13px;color:#555">Reply to this email to answer the requester.</p>`,
  };
}

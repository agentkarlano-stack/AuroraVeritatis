import { useState } from 'react';
import { Link } from 'react-router';
import { PageHeader, Panel } from '../components/ui';
import { AI_USAGE, DURATIONS, FUNCTIONS, INDUSTRIES, SEAT_OPTIONS, validateQuote } from '../../shared/businessQuote';

const SEAT_LABEL: Record<string, string> = { custom: 'Other (describe)' };

/** Business & Institutional quote request. No public business prices: the team answers with a private proposal. */
export default function Business() {
  const [f, setF] = useState({ organization: '', contact: '', email: '', country: '', industry: '', seats: '', customSeats: '', aiUsage: '', duration: '', details: '', website: '' });
  const [functions, setFunctions] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));

  const submit = async () => {
    const payload = { ...f, functions, consent };
    const v = validateQuote(payload);
    if (!v.ok) {
      setResult({ ok: false, message: v.error });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/business/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      setResult({ ok: res.ok, message: data.message ?? data.error ?? (res.ok ? 'Thank you. We will reply by email.' : 'Something went wrong. Please email auroraveritatissup@gmail.com.') });
    } catch {
      setResult({ ok: false, message: 'Network error. Please try again, or email auroraveritatissup@gmail.com.' });
    }
    setBusy(false);
  };

  if (result?.ok) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <PageHeader eyebrow="Business & Institutional" title="Request received" />
        <Panel>
          <p className="text-sm text-mist" role="status">
            {result.message}
          </p>
          <Link to="/pricing" className="btn-ghost mt-4 inline-flex">
            Back to plans
          </Link>
        </Panel>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <PageHeader eyebrow="Business & Institutional" title="Request a Business Quote">
        Tell us about your organisation and what you need. We prepare a private proposal for your team, with seats, features and AI usage
        sized to your needs. There are no public business prices, and nothing is charged by sending this form.
      </PageHeader>
      <form
        className="panel space-y-4 p-5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Organisation name">
            <input className="input mt-1" required maxLength={160} autoComplete="organization" value={f.organization} onChange={set('organization')} />
          </Field>
          <Field label="Contact person">
            <input className="input mt-1" required maxLength={120} autoComplete="name" value={f.contact} onChange={set('contact')} />
          </Field>
          <Field label="Business email">
            <input className="input mt-1" type="email" required maxLength={254} autoComplete="email" value={f.email} onChange={set('email')} />
          </Field>
          <Field label="Country">
            <input className="input mt-1" required maxLength={80} autoComplete="country-name" value={f.country} onChange={set('country')} />
          </Field>
          <Field label="Industry">
            <select className="input mt-1" required value={f.industry} onChange={set('industry')}>
              <option value="">Choose…</option>
              {INDUSTRIES.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </Field>
          <Field label="Estimated number of users">
            <select className="input mt-1" required value={f.seats} onChange={set('seats')}>
              <option value="">Choose…</option>
              {SEAT_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {SEAT_LABEL[o] ?? o}
                </option>
              ))}
            </select>
          </Field>
          {f.seats === 'custom' && (
            <Field label="Describe the number of users" wide>
              <input className="input mt-1" maxLength={40} value={f.customSeats} onChange={set('customSeats')} placeholder="For example: 30 analysts, 200 students per term" />
            </Field>
          )}
        </div>

        <fieldset>
          <legend className="text-sm text-platinum">Required functionality</legend>
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {FUNCTIONS.map((o) => (
              <label key={o} className="flex min-h-6 items-start gap-2 text-sm text-mist">
                <input type="checkbox" className="mt-1 accent-[#c9a35a]" checked={functions.includes(o)} onChange={(e) => setFunctions((p) => (e.target.checked ? [...p, o] : p.filter((x) => x !== o)))} />
                <span>{o}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Expected AI usage">
            <select className="input mt-1" required value={f.aiUsage} onChange={set('aiUsage')}>
              <option value="">Choose…</option>
              {AI_USAGE.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </Field>
          <Field label="Preferred contract duration">
            <select className="input mt-1" required value={f.duration} onChange={set('duration')}>
              <option value="">Choose…</option>
              {DURATIONS.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Additional requirements (optional)" wide>
          <textarea className="input mt-1 min-h-28" maxLength={3000} value={f.details} onChange={set('details')} placeholder="Timeline, data sources, security or procurement requirements, single sign-on, invoicing…" />
        </Field>

        {/* Honeypot: hidden from people and assistive technology; bots tend to fill it. */}
        <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" value={f.website} onChange={set('website')} />
        <label className="flex items-start gap-2 text-xs leading-snug text-slate-dim">
          <input type="checkbox" className="mt-0.5 accent-[#c9a35a]" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>
            Aurora Veritatis may use these details to answer this request by email. We do not add you to any mailing list. See the{' '}
            <Link className="text-gold hover:underline" to="/legal/privacy">
              privacy policy
            </Link>
            .
          </span>
        </label>
        {result && (
          <p className="text-sm text-warn" role="alert">
            {result.message}
          </p>
        )}
        <button className="btn-primary" disabled={busy}>
          {busy ? 'Sending…' : 'Send request'}
        </button>
      </form>
    </div>
  );
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={`block text-sm text-platinum ${wide ? 'sm:col-span-2' : ''}`}>
      {label}
      {children}
    </label>
  );
}

import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { NewsletterSignup } from '../components/NewsletterSignup';
import { newsletterPost } from '../lib/newsletter';
import { PageHeader, Panel } from '../components/ui';

const STATUS: Record<string, { tone: 'ok' | 'warn'; text: string }> = {
  confirmed: { tone: 'ok', text: 'Thank you. Your subscription is confirmed.' },
  unsubscribed: { tone: 'ok', text: 'You have been unsubscribed from the Aurora Veritatis newsletter.' },
  deleted: { tone: 'ok', text: 'Your newsletter data held for Aurora Veritatis has been deleted.' },
  invalid: { tone: 'warn', text: 'This link is invalid or has expired. Request a new one below.' },
  error: { tone: 'warn', text: 'We could not complete the request right now. Please try again later.' },
  unavailable: { tone: 'warn', text: 'This request cannot be processed online yet. Email auroraveritatissup@gmail.com.' },
};

export default function Newsletter() {
  const [params] = useSearchParams();
  const status = STATUS[params.get('status') ?? ''];
  const [email, setEmail] = useState('');
  const [action, setAction] = useState<'unsubscribe' | 'delete'>('unsubscribe');
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <PageHeader eyebrow="Email" title="Newsletter">
        Subscribe, unsubscribe or ask us to delete your newsletter data. Account emails (sign-in, password reset) are separate and are not affected.
      </PageHeader>
      {status && (
        <p className={`mb-4 rounded-lg border px-4 py-3 text-sm ${status.tone === 'ok' ? 'border-up/40 bg-up/5 text-up' : 'border-warn/40 bg-warn/5 text-warn'}`} role="status">
          {status.text}
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Subscribe">
          <NewsletterSignup />
        </Panel>
        <Panel title="Unsubscribe or delete">
          <form
            className="space-y-3 text-sm"
            onSubmit={(e) => {
              e.preventDefault();
              setBusy(true);
              void newsletterPost('request', { email, action }).then((r) => {
                setResult(r);
                setBusy(false);
              });
            }}
          >
            <p className="text-xs text-mist">We send a confirmation link to the address, so nobody can change someone else's subscription. Every newsletter also has an unsubscribe link.</p>
            <input type="email" required maxLength={254} className="input" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Your email address" />
            <fieldset className="space-y-1 text-xs text-mist">
              <legend className="sr-only">Request</legend>
              <label className="flex items-center gap-2">
                <input type="radio" name="action" className="accent-[#c9a35a]" checked={action === 'unsubscribe'} onChange={() => setAction('unsubscribe')} /> Unsubscribe from the newsletter
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="action" className="accent-[#c9a35a]" checked={action === 'delete'} onChange={() => setAction('delete')} /> Delete my newsletter data (GDPR)
              </label>
            </fieldset>
            <button className="btn-ghost text-xs" disabled={busy || !email}>
              Send confirmation link
            </button>
            {result && (
              <p className={`text-xs ${result.ok ? 'text-up' : 'text-warn'}`} role="status">
                {result.message}
              </p>
            )}
          </form>
        </Panel>
      </div>
    </div>
  );
}

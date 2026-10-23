import { useState } from 'react';
import { Link } from 'react-router';
import { useApi } from '../lib/api';
import { newsletterPost } from '../lib/newsletter';

interface IntegrationStatus {
  brevo: { configured: boolean; listConfigured: boolean; doubleOptInConfigured: boolean; senderConfigured: boolean };
}

/**
 * Newsletter sign-up with explicit, unticked consent and double opt-in (Brevo). A hidden honeypot field catches bots.
 * Shown as "opening soon" until the Worker reports a configured list and confirmation template.
 */
export function NewsletterSignup({ compact = false }: { compact?: boolean }) {
  const status = useApi<IntegrationStatus>('/api/integrations');
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const b = status.status === 'ready' ? status.data.brevo : null;
  const open = !!b && b.configured && b.listConfigured && b.doubleOptInConfigured;

  if (status.status === 'loading') return null;
  if (!open) {
    return (
      <div className="text-xs text-slate-dim">
        <div className="eyebrow mb-2">Newsletter</div>
        Newsletter sign-up opens soon.
      </div>
    );
  }
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        void newsletterPost('subscribe', { email, consent, website }).then((r) => {
          setResult(r);
          setBusy(false);
          if (r.ok) setEmail('');
        });
      }}
    >
      <div className="eyebrow">Newsletter</div>
      {!compact && <p className="text-xs leading-relaxed text-mist">Briefings, new research tools and product news. About once a week; no advertising for third parties.</p>}
      <div className="flex gap-2">
        <input type="email" required maxLength={254} autoComplete="email" className="input h-9" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email address for the newsletter" />
        <button className="btn-primary h-9 shrink-0 text-xs" disabled={busy || !consent || !email}>
          Subscribe
        </button>
      </div>
      {/* Honeypot: hidden from people and assistive technology; bots tend to fill it. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" value={website} onChange={(e) => setWebsite(e.target.value)} />
      <label className="flex items-start gap-2 text-[11px] leading-snug text-slate-dim">
        <input type="checkbox" className="mt-0.5 accent-[#c9a35a]" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
        <span>
          Yes, email me the Aurora Veritatis newsletter. I will confirm by email, and I can unsubscribe at any time. Sent via Brevo (EU); see the{' '}
          <Link className="text-gold hover:underline" to="/legal/privacy">
            privacy policy
          </Link>
          .
        </span>
      </label>
      {result && (
        <p className={`text-xs ${result.ok ? 'text-up' : 'text-warn'}`} role="status">
          {result.message}
        </p>
      )}
    </form>
  );
}

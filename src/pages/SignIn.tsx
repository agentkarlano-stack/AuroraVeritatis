import { useState } from 'react';
import { friendlyAuthError } from '../auth/authErrors';
import { Link, Navigate } from 'react-router';
import { useAuth } from '../auth/AuthProvider';
import { Monogram } from '../components/Logo';
import { Loading } from '../components/ui';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function SignIn() {
  const auth = useAuth();
  const [mode, setMode] = useState<'magic' | 'password' | 'signup' | 'reset'>('magic');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  if (auth.status === 'loading') return <div className="mx-auto max-w-md px-4 py-16"><Loading /></div>;
  if (auth.status === 'signed-in') return <Navigate to="/account" replace />;
  const disabled = auth.status === 'unconfigured';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (!EMAIL_RE.test(email)) return setMsg({ kind: 'err', text: 'Enter a valid email address.' });
    if ((mode === 'password' || mode === 'signup') && password.length < 10) return setMsg({ kind: 'err', text: 'Passwords must be at least 10 characters.' });
    setBusy(true);
    try {
      if (mode === 'magic') {
        await auth.sendMagicLink(email);
        setMsg({ kind: 'ok', text: 'Check your inbox for a sign-in link.' });
      } else if (mode === 'reset') {
        await auth.requestPasswordReset(email);
        setMsg({ kind: 'ok', text: 'If an account exists for this address, a reset link is on its way.' });
      } else if (mode === 'signup') {
        await auth.signUp(email, password);
        setMsg({ kind: 'ok', text: 'Account created. Confirm your email address to continue.' });
      } else {
        await auth.signInWithPassword(email, password);
      }
    } catch (err) {
      setMsg({ kind: 'err', text: friendlyAuthError(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="panel p-6">
        <Monogram className="h-10 w-auto" />
        <h1 className="mt-5 text-xl font-semibold">{mode === 'signup' ? 'Create your account' : 'Sign in to Aurora Veritatis'}</h1>
        {disabled ? (
          <p className="mt-3 rounded-md border border-gold-dim/50 bg-gold/5 p-3 text-sm text-gold-soft">
            Accounts are not switched on yet. You can use every module as a guest, and your preferences are saved in this
            browser.
          </p>
        ) : (
          <p className="mt-2 text-sm text-mist">Accounts let you sync watchlists, layouts and research across devices.</p>
        )}
        {auth.urlError && (
          <p role="alert" className="mt-3 rounded-md border border-down/40 p-3 text-sm text-mist">
            {auth.urlError}
          </p>
        )}
        <div className="mt-5 flex gap-1" role="tablist">
          {(
            [
              ['magic', 'Email link'],
              ['password', 'Password'],
              ['signup', 'Register'],
            ] as const
          ).map(([m, l]) => (
            <button key={m} role="tab" aria-selected={mode === m} className="chip" aria-pressed={mode === m} onClick={() => setMode(m)}>
              {l}
            </button>
          ))}
        </div>
        <form className="mt-4 space-y-3" onSubmit={submit}>
          <div>
            <label className="label" htmlFor="email">
              Email
            </label>
            <input id="email" type="email" autoComplete="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} disabled={disabled} required />
          </div>
          {(mode === 'password' || mode === 'signup') && (
            <div>
              <label className="label" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={disabled}
                minLength={10}
                required
              />
            </div>
          )}
          {msg && (
            <p role={msg.kind === 'err' ? 'alert' : 'status'} className={`text-sm ${msg.kind === 'err' ? 'text-down' : 'text-up'}`}>
              {msg.text}
            </p>
          )}
          <button className="btn-primary w-full" disabled={disabled || busy}>
            {busy ? 'Please wait…' : { magic: 'Send sign-in link', signup: 'Create account', password: 'Sign in', reset: 'Send reset link' }[mode]}
          </button>
        </form>
        {mode === 'password' && (
          <button className="mt-3 text-xs text-gold hover:underline" onClick={() => setMode('reset')} disabled={disabled}>
            Forgot password?
          </button>
        )}
        <p className="mt-4 text-xs text-slate-dim">
          By continuing you agree to the draft <Link className="text-gold hover:underline" to="/legal/terms">Terms</Link> and{' '}
          <Link className="text-gold hover:underline" to="/legal/privacy">Privacy Policy</Link>.
        </p>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { friendlyAuthError } from '../../auth/authErrors';
import { useAuth } from '../../auth/AuthProvider';
import { Panel } from '../ui';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
type Msg = { ok: boolean; text: string } | null;

/** Email and password changes, each confirmed with the current password first (re-authentication). */
export function SecuritySettings() {
  const { client, session } = useAuth();
  const email = session?.user.email ?? '';
  const [newEmail, setNewEmail] = useState('');
  const [emailPw, setEmailPw] = useState('');
  const [emailMsg, setEmailMsg] = useState<Msg>(null);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [pwMsg, setPwMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState<'email' | 'password' | null>(null);

  const reauth = async (password: string) => {
    const { error } = await client!.auth.signInWithPassword({ email, password });
    return !error;
  };

  const changeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailMsg(null);
    if (!EMAIL_RE.test(newEmail) || newEmail.toLowerCase() === email.toLowerCase()) return setEmailMsg({ ok: false, text: 'Enter a different, valid email address.' });
    setBusy('email');
    try {
      if (!(await reauth(emailPw))) return setEmailMsg({ ok: false, text: 'Your current password is not correct.' });
      const { error } = await client!.auth.updateUser({ email: newEmail }, { emailRedirectTo: `${location.origin}/account` });
      if (error) return setEmailMsg({ ok: false, text: error.message });
      setEmailMsg({ ok: true, text: `Confirmation links are on their way. The change takes effect once you confirm it from ${newEmail} (and, if required, from ${email}).` });
      setNewEmail('');
      setEmailPw('');
    } finally {
      setBusy(null);
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMsg(null);
    if (next.length < 10) return setPwMsg({ ok: false, text: 'New passwords must be at least 10 characters.' });
    if (next === current) return setPwMsg({ ok: false, text: 'Choose a password different from the current one.' });
    setBusy('password');
    try {
      if (!(await reauth(current))) return setPwMsg({ ok: false, text: 'Your current password is not correct.' });
      const { error } = await client!.auth.updateUser({ password: next });
      if (error) return setPwMsg({ ok: false, text: friendlyAuthError(error) });
      setPwMsg({ ok: true, text: 'Password changed.' });
      setCurrent('');
      setNext('');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Panel title="Security" eyebrow="Changes need your current password">
      <div className="grid gap-6 md:grid-cols-2">
        <form className="space-y-2 text-sm" onSubmit={(e) => void changeEmail(e)}>
          <div className="text-xs font-medium text-platinum">Change email</div>
          <p className="text-[11px] text-slate-dim">Current: {email} (private, never shown publicly)</p>
          <input type="email" className="input" placeholder="New email address" autoComplete="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} aria-label="New email address" required />
          <input type="password" className="input" placeholder="Current password" autoComplete="current-password" value={emailPw} onChange={(e) => setEmailPw(e.target.value)} aria-label="Current password for email change" required />
          <button className="btn-ghost text-xs" disabled={busy !== null}>
            {busy === 'email' ? 'Please wait…' : 'Send confirmation'}
          </button>
          {emailMsg && (
            <p role={emailMsg.ok ? 'status' : 'alert'} className={`text-xs ${emailMsg.ok ? 'text-up' : 'text-down'}`}>
              {emailMsg.text}
            </p>
          )}
        </form>
        <form className="space-y-2 text-sm" onSubmit={(e) => void changePassword(e)}>
          <div className="text-xs font-medium text-platinum">Change password</div>
          <input type="text" autoComplete="username" value={email} readOnly hidden aria-hidden />
          <input type="password" className="input" placeholder="Current password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} aria-label="Current password" required />
          <input type="password" className="input" placeholder="New password (10+ characters)" autoComplete="new-password" minLength={10} value={next} onChange={(e) => setNext(e.target.value)} aria-label="New password" required />
          <button className="btn-ghost text-xs" disabled={busy !== null}>
            {busy === 'password' ? 'Please wait…' : 'Change password'}
          </button>
          {pwMsg && (
            <p role={pwMsg.ok ? 'status' : 'alert'} className={`text-xs ${pwMsg.ok ? 'text-up' : 'text-down'}`}>
              {pwMsg.text}
            </p>
          )}
        </form>
      </div>
      <p className="mt-3 text-[11px] text-slate-dim">Signed in with an email link and no password yet? Use “Forgot password” on the sign-in page to set one.</p>
    </Panel>
  );
}

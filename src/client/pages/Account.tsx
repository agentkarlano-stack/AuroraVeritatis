import { useState, type FormEvent } from "react";
import { Notice, PlannedTag } from "../components/Tags";
import { useAuth } from "../lib/auth";
import { Link } from "../lib/router";

type Mode = "sign-in" | "sign-up" | "reset";

export function Account() {
  const auth = useAuth();

  return (
    <div className="shell" style={{ maxWidth: 720 }}>
      <header className="page-head">
        <h1>Account</h1>
        <p>Sign in to sync your Headquarters layout and watchlists across devices.</p>
      </header>
      <div className="section stack-lg" style={{ paddingTop: 0 }}>
        {auth.status === "loading" && <p className="muted">Checking your session…</p>}
        {auth.status === "unconfigured" && (
          <Notice>
            <strong>Accounts are not enabled in this environment.</strong> The account system is built for Supabase Auth, but no Supabase project
            is connected to this deployment yet. Your Headquarters settings are still saved on this device.
          </Notice>
        )}
        {(auth.status === "signed-out" || auth.status === "unconfigured") && <AuthForm disabled={auth.status === "unconfigured"} />}
        {auth.status === "signed-in" && <SignedIn />}
      </div>
    </div>
  );
}

function AuthForm({ disabled }: { disabled: boolean }) {
  const { signIn, signUp, recover } = useAuth();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      if (mode === "sign-in") {
        await signIn(email, password);
      } else if (mode === "sign-up") {
        const { needsConfirmation } = await signUp(email, password, name || undefined);
        if (needsConfirmation) setMessage({ tone: "ok", text: `Account created. Confirm it from the email sent to ${email}, then sign in.` });
      } else {
        await recover(email);
        setMessage({ tone: "ok", text: `If an account exists for ${email}, a reset link is on its way.` });
      }
    } catch (err) {
      setMessage({ tone: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const action = mode === "sign-in" ? "Sign in" : mode === "sign-up" ? "Create account" : "Send reset link";

  return (
    <section className="panel stack-lg">
      <div className="segmented" role="group" aria-label="Account action">
        <button aria-pressed={mode === "sign-in"} onClick={() => setMode("sign-in")}>Sign in</button>
        <button aria-pressed={mode === "sign-up"} onClick={() => setMode("sign-up")}>Create account</button>
        <button aria-pressed={mode === "reset"} onClick={() => setMode("reset")}>Reset password</button>
      </div>
      <form className="stack-lg" onSubmit={submit}>
        <fieldset disabled={disabled || busy} style={{ border: 0, padding: 0, margin: 0 }} className="stack-lg">
          {mode === "sign-up" && (
            <div className="field">
              <label htmlFor="acc-name">Display name (optional)</label>
              <input id="acc-name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="nickname" />
            </div>
          )}
          <div className="field">
            <label htmlFor="acc-email">Email</label>
            <input id="acc-email" className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </div>
          {mode !== "reset" && (
            <div className="field">
              <label htmlFor="acc-pass">Password</label>
              <input
                id="acc-pass"
                className="input"
                type="password"
                required
                minLength={mode === "sign-up" ? 10 : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
              />
              {mode === "sign-up" && <span className="tiny muted">At least 10 characters.</span>}
            </div>
          )}
          <div>
            <button className="btn btn-primary" type="submit">{busy ? "Working…" : action}</button>
          </div>
        </fieldset>
      </form>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      <p className="tiny muted">By creating an account you agree to the terms and privacy policy, which will be published before public launch.</p>
    </section>
  );
}

function SignedIn() {
  const { session, profile, signOut } = useAuth();
  return (
    <>
      <section className="panel">
        <div className="panel-head"><h2>Profile</h2></div>
        <dl className="detail-list">
          <div><dt>Email</dt><dd>{session?.user.email}</dd></div>
          <div><dt>Display name</dt><dd>{profile?.display_name ?? "—"}</dd></div>
          <div><dt>Plan</dt><dd style={{ textTransform: "capitalize" }}>{profile?.plan ?? "free"}</dd></div>
        </dl>
        <div className="panel-foot" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link to="/hq" className="btn btn-sm">Open Headquarters</Link>
          <button className="btn btn-sm btn-ghost" onClick={() => void signOut()}>Sign out</button>
        </div>
      </section>
      <section className="panel">
        <div className="panel-head"><h2>Subscription</h2><PlannedTag>Payments not yet available</PlannedTag></div>
        <p className="small muted">Paid plans are not on sale yet. <Link to="/plans">See the planned tiers</Link>.</p>
      </section>
    </>
  );
}

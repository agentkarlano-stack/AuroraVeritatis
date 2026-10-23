/**
 * Administrator self-check, run by the administrator from /admin in their own session (the test suite cannot sign in as
 * the owner). Every step uses the same server functions as the dashboard, so a pass proves the role, the audit log
 * and grant/revoke work end to end. The only change it makes is a one-hour Premium grant on the administrator's own
 * account, revoked immediately; it is skipped when the account already has an active grant, which it would replace.
 */

export interface Rpc {
  (fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>;
}
export interface ProfileApi {
  read(): PromiseLike<{ display_name: string | null } | null>;
  write(displayName: string | null): PromiseLike<{ ok: boolean; message?: string }>;
}
export interface StepResult {
  name: string;
  status: 'pass' | 'fail' | 'skip';
  detail: string;
}

interface Entitlements {
  tier: string;
  is_admin: boolean;
  grant: { tier: string } | null;
}

export const SELF_CHECK_REASON = 'Administrator self-check (automatic, revoked immediately)';

export async function runAdminSelfCheck(rpc: Rpc, profile: ProfileApi, myId: string, now = Date.now()): Promise<StepResult[]> {
  const out: StepResult[] = [];
  const step = async (name: string, fn: () => Promise<string>) => {
    try {
      out.push({ name, status: 'pass', detail: await fn() });
    } catch (e) {
      out.push(e instanceof SkipStep ? { name, status: 'skip', detail: e.message } : { name, status: 'fail', detail: (e as Error).message });
    }
  };
  const call = async <T>(fn: string, args?: Record<string, unknown>): Promise<T> => {
    const r = await rpc(fn, args);
    if (r.error) throw new Error(`${fn}: ${r.error.code ?? ''} ${r.error.message}`.trim());
    return r.data as T;
  };

  let before: Entitlements | null = null;
  await step('The server confirms the administrator role', async () => {
    before = await call<Entitlements>('my_entitlements');
    if (!before.is_admin) throw new Error('my_entitlements reports is_admin = false');
    return `is_admin = true, plan ${before.tier}`;
  });
  await step('Statistics, user list and audit log are readable', async () => {
    const stats = await call<{ users: number; admins: number }>('admin_stats');
    const users = await call<{ id: string; is_admin: boolean }[]>('admin_list_users', { search: '', lim: 200, off: 0 });
    await call('admin_audit_log', { lim: 5 });
    const me = users.find((u) => u.id === myId);
    if (!me?.is_admin) throw new Error('your account is not listed as administrator');
    return `${stats.users} accounts, ${stats.admins} administrator(s)`;
  });
  await step('Assign and revoke a complimentary plan', async () => {
    const b = before as Entitlements | null;
    if (!b) throw new SkipStep('role check failed');
    if (b.grant) throw new SkipStep(`your account has an active ${b.grant.tier} grant; the check would replace it`);
    const expires = new Date(now + 3_600_000).toISOString();
    const granted = await call<{ tier: string; grant_id: string }>('admin_grant_plan', { target: myId, new_tier: 'premium', expires, why: SELF_CHECK_REASON });
    let revoked = false;
    try {
      const during = await call<Entitlements>('my_entitlements');
      if (during.tier !== 'premium') throw new Error(`after the grant the plan is ${during.tier}, not premium`);
      const r = await call<{ tier: string }>('admin_revoke_grant', { grant_id: granted.grant_id, why: SELF_CHECK_REASON });
      revoked = true;
      const after = await call<Entitlements>('my_entitlements');
      if (after.tier !== b.tier || r.tier !== b.tier) throw new Error(`after revoking the plan is ${after.tier}, expected ${b.tier}`);
      const log = await call<{ action: string }[]>('admin_audit_log', { lim: 5 });
      if (!log.some((l) => l.action === 'plan.grant') || !log.some((l) => l.action === 'plan.revoke')) throw new Error('grant or revoke missing from the audit log');
      return `Premium granted (plan became premium), revoked (back to ${after.tier}); both in the audit log`;
    } finally {
      if (!revoked) await rpc('admin_revoke_grant', { grant_id: granted.grant_id, why: SELF_CHECK_REASON });
    }
  });
  await step('Your profile can be edited', async () => {
    const p = await profile.read();
    if (!p) throw new Error('profile not found');
    const w = await profile.write(p.display_name);
    if (!w.ok) throw new Error(w.message ?? 'update refused');
    return 'profile update accepted (display name written back unchanged)';
  });
  return out;
}

export class SkipStep extends Error {}

/** One-line summary to paste back to the developer. */
export function summarize(results: StepResult[], at: string): string {
  const n = (s: StepResult['status']) => results.filter((r) => r.status === s).length;
  return `Admin self-check ${at}: ${n('pass')} passed, ${n('fail')} failed, ${n('skip')} skipped. ${results.map((r) => `${r.status.toUpperCase()} ${r.name}: ${r.detail}`).join(' | ')}`;
}

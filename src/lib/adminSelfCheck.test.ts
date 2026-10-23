import { describe, expect, it } from 'vitest';
import { runAdminSelfCheck, summarize, type Rpc } from './adminSelfCheck';

function fakeServer(opts: { admin?: boolean; grant?: boolean } = {}) {
  let tier = opts.grant ? 'prime' : 'free';
  const audit: string[] = [];
  const calls: string[] = [];
  const rpc: Rpc = async (fn, args) => {
    calls.push(fn);
    const deny = { data: null, error: { code: '42501', message: 'Administrator role required' } };
    if (fn === 'my_entitlements') return { data: { tier, is_admin: opts.admin !== false, grant: tier === 'free' ? null : { tier } }, error: null };
    if (opts.admin === false) return deny;
    if (fn === 'admin_stats') return { data: { users: 3, admins: 1 }, error: null };
    if (fn === 'admin_list_users') return { data: [{ id: 'me', is_admin: true }], error: null };
    if (fn === 'admin_audit_log') return { data: audit.map((action) => ({ action })), error: null };
    if (fn === 'admin_grant_plan') {
      tier = args!.new_tier as string;
      audit.unshift('plan.grant');
      return { data: { tier, grant_id: 'g1' }, error: null };
    }
    if (fn === 'admin_revoke_grant') {
      tier = 'free';
      audit.unshift('plan.revoke');
      return { data: { tier }, error: null };
    }
    return { data: null, error: { message: 'unknown' } };
  };
  const profile = { read: async () => ({ display_name: 'Owner' }), write: async () => ({ ok: true }) };
  return { rpc, profile, calls, tier: () => tier };
}

describe('administrator self-check', () => {
  it('passes for an administrator and leaves the plan unchanged', async () => {
    const s = fakeServer();
    const r = await runAdminSelfCheck(s.rpc, s.profile, 'me');
    expect(r.map((x) => x.status)).toEqual(['pass', 'pass', 'pass', 'pass']);
    expect(s.tier()).toBe('free');
    expect(summarize(r, 'now')).toMatch(/^Admin self-check now: 4 passed, 0 failed, 0 skipped/);
  });

  it('never replaces an existing grant', async () => {
    const s = fakeServer({ grant: true });
    const r = await runAdminSelfCheck(s.rpc, s.profile, 'me');
    expect(r[2]).toMatchObject({ status: 'skip' });
    expect(s.calls).not.toContain('admin_grant_plan');
    expect(s.tier()).toBe('prime');
  });

  it('fails clearly without the role', async () => {
    const s = fakeServer({ admin: false });
    const r = await runAdminSelfCheck(s.rpc, s.profile, 'me');
    expect(r[0]).toMatchObject({ status: 'fail', detail: expect.stringMatching(/is_admin = false/) });
    expect(r[1]).toMatchObject({ status: 'fail', detail: expect.stringMatching(/42501/) });
  });
});

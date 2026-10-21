import { describe, expect, it } from 'vitest';
import { MAX_SYNC_BYTES, initialSync, pickSynced, type PrefsBackend, type PrefsRow, type SyncedPrefs } from './sync';

function fakeBackend(row: PrefsRow | null = null) {
  const saved: { userId: string; data: SyncedPrefs; updatedAt: string }[] = [];
  const backend: PrefsBackend = {
    load: async () => row,
    save: async (userId, data, updatedAt) => {
      saved.push({ userId, data, updatedAt });
    },
  };
  return { backend, saved };
}

const NOW = () => '2026-10-21T12:00:00.000Z';

describe('preference sync', () => {
  it('only picks synced keys (never notes or flags)', () => {
    expect(pickSynced({ watchlist: ['A'], notes: [{ id: 1 }], introSeen: true, layout: ['x'] })).toEqual({ watchlist: ['A'], layout: ['x'] });
  });

  it('pushes local data when there is no remote row', async () => {
    const { backend, saved } = fakeBackend(null);
    const r = await initialSync(backend, 'u1', { watchlist: ['GOLD.D'] }, '2026-10-21T10:00:00Z', NOW);
    expect(r).toEqual({ action: 'pushed', updatedAt: NOW() });
    expect(saved).toEqual([{ userId: 'u1', data: { watchlist: ['GOLD.D'] }, updatedAt: NOW() }]);
  });

  it('pulls remote data that is newer than the last local change', async () => {
    const { backend, saved } = fakeBackend({ data: { watchlist: ['BTC.D'], notes: ['ignored'] } as SyncedPrefs, updated_at: '2026-10-21T11:00:00Z' });
    const r = await initialSync(backend, 'u1', { watchlist: ['GOLD.D'] }, '2026-10-21T10:00:00Z', NOW);
    expect(r).toEqual({ action: 'pulled', data: { watchlist: ['BTC.D'] }, updatedAt: '2026-10-21T11:00:00Z' });
    expect(saved).toHaveLength(0);
  });

  it('pulls remote data on a fresh device with no local changes', async () => {
    const { backend } = fakeBackend({ data: { favorites: ['DEU'] }, updated_at: '2026-01-01T00:00:00Z' });
    expect((await initialSync(backend, 'u1', { favorites: ['USA'] }, null, NOW)).action).toBe('pulled');
  });

  it('keeps newer local data and uploads it', async () => {
    const { backend, saved } = fakeBackend({ data: { watchlist: ['BTC.D'] }, updated_at: '2026-10-20T09:00:00Z' });
    const r = await initialSync(backend, 'u1', { watchlist: ['GOLD.D'] }, '2026-10-21T10:00:00Z', NOW);
    expect(r.action).toBe('pushed');
    expect(saved[0]!.data).toEqual({ watchlist: ['GOLD.D'] });
  });

  it('refuses to upload data over the size limit', async () => {
    const { backend, saved } = fakeBackend(null);
    const huge = { drawings: { X: 'x'.repeat(MAX_SYNC_BYTES) } };
    const r = await initialSync(backend, 'u1', huge, '2026-10-21T10:00:00Z', NOW);
    expect(r.action).toBe('skipped');
    expect(saved).toHaveLength(0);
  });

  it('propagates backend errors', async () => {
    const backend: PrefsBackend = { load: async () => Promise.reject(new Error('RLS denied')), save: async () => {} };
    await expect(initialSync(backend, 'u1', {}, null, NOW)).rejects.toThrow('RLS denied');
  });
});

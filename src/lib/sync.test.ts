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

describe('notes sync', () => {
  const n = (id: string, createdAt: string) => ({ id, title: id, body: '', createdAt });
  const A = '00000000-0000-4000-8000-00000000000a';
  const B = '00000000-0000-4000-8000-00000000000b';
  const C = '00000000-0000-4000-8000-00000000000c';

  it('merges by id, newest first, and uploads only local-only notes', async () => {
    const { mergeNotes } = await import('./sync');
    const r = mergeNotes([n(A, '2026-10-21'), n(B, '2026-10-19')], [n(B, '2026-10-19'), n(C, '2026-10-20')]);
    expect(r.merged.map((x) => x.id)).toEqual([A, C, B]);
    expect(r.toUpload.map((x) => x.id)).toEqual([A]);
  });

  it('keeps non-uuid notes local only', async () => {
    const { mergeNotes, diffNotes } = await import('./sync');
    expect(mergeNotes([n('12345', '2026-10-21')], []).toUpload).toEqual([]);
    expect(diffNotes([], [n('12345', '2026-10-21')]).added).toEqual([]);
  });

  it('diffs additions and removals', async () => {
    const { diffNotes } = await import('./sync');
    const d = diffNotes([n(A, '1'), n(B, '2')], [n(B, '2'), n(C, '3')]);
    expect(d.added.map((x) => x.id)).toEqual([C]);
    expect(d.removed).toEqual([A]);
  });

  it('detects edited notes', async () => {
    const { diffNotes } = await import('./sync');
    const before = n(A, '1');
    const d = diffNotes([before, n(B, '2')], [{ ...before, title: 'Edited' }, n(B, '2')]);
    expect(d.changed.map((x) => x.id)).toEqual([A]);
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
  });
});

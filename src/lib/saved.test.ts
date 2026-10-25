import { describe, expect, it } from 'vitest';
import { clean, collections, diffSaved, mergeSaved, savedKey, type SavedItem } from './saved';

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const item = (n: number, patch: Partial<SavedItem> = {}): SavedItem => ({
  id: U(n),
  kind: 'country',
  title: `Item ${n}`,
  href: `/countries/X${n}`,
  url: '',
  collection: '',
  note: '',
  meta: {},
  createdAt: `2026-10-2${n}T00:00:00.000Z`,
  updatedAt: `2026-10-2${n}T00:00:00.000Z`,
  ...patch,
});

describe('saved intelligence', () => {
  it('identifies the same bookmark by kind and link', () => {
    expect(savedKey(item(1))).toBe(savedKey({ kind: 'country', href: '/countries/X1', url: '' }));
    expect(savedKey(item(1))).not.toBe(savedKey({ kind: 'chart', href: '/countries/X1', url: '' }));
  });

  it('cleans links and lengths', () => {
    const c = clean(item(1, { href: 'https://x.com', url: 'javascript:alert(1)', note: 'n'.repeat(3000), collection: '  Energy  ' }));
    expect(c.href).toBe('');
    expect(c.url).toBe('');
    expect(c.note).toHaveLength(2000);
    expect(c.collection).toBe('Energy');
  });

  it('groups collections, unsorted last', () => {
    expect(collections([item(1, { collection: 'Energy' }), item(2), item(3, { collection: 'Asia' }), item(4, { collection: 'Energy' })])).toEqual([
      { name: 'Asia', count: 1 },
      { name: 'Energy', count: 2 },
      { name: '', count: 1 },
    ]);
  });

  it('merges by id with the newer edit winning and uploads what the server lacks', () => {
    const remote = [item(1, { note: 'server', updatedAt: '2026-10-25T00:00:00.000Z' }), item(2)];
    const local = [item(1, { note: 'local', updatedAt: '2026-10-26T00:00:00.000Z' }), item(3), item(4, { id: 'not-a-uuid' })];
    const { merged, toUpload } = mergeSaved(local, remote);
    expect(merged.find((i) => i.id === U(1))!.note).toBe('local');
    expect(toUpload.map((i) => i.id)).toEqual([U(1), U(3)]);
    expect(merged).toHaveLength(4);
  });

  it('diffs edits and removals for upload', () => {
    const a = item(1);
    const b = item(2);
    const b2 = { ...b, note: 'x' };
    expect(diffSaved([a, b], [b2, item(3)])).toEqual({ upsert: [b2, item(3)], removed: [U(1)] });
  });
});

import { describe, expect, it } from 'vitest';
import { COALESCE_MS, emptyHistory, record, redo, undo } from './history';

describe('undo/redo history', () => {
  it('undoes and redoes single edits in order', () => {
    let h = emptyHistory<number>();
    h = record(h, 0, null, 0);
    h = record(h, 1, null, 10);
    // current value is 2
    const u1 = undo(h, 2)!;
    expect(u1.value).toBe(1);
    const u2 = undo(u1.history, 1)!;
    expect(u2.value).toBe(0);
    expect(undo(u2.history, 0)).toBeNull();
    const r1 = redo(u2.history, 0)!;
    expect(r1.value).toBe(1);
    expect(redo(r1.history, 1)!.value).toBe(2);
  });
  it('coalesces bursts with the same key into one step', () => {
    let h = emptyHistory<string>();
    h = record(h, '', 'label', 0);
    h = record(h, 'a', 'label', 200);
    h = record(h, 'ab', 'label', 400);
    expect(h.past).toEqual(['']);
    // A pause or another field starts a new step.
    h = record(h, 'abc', 'label', 400 + COALESCE_MS + 1);
    h = record(h, 'abcd', 'notes', 400 + COALESCE_MS + 2);
    expect(h.past).toEqual(['', 'abc', 'abcd']);
  });
  it('drops the redo branch after a new edit and keeps a bounded past', () => {
    let h = emptyHistory<number>();
    for (let i = 0; i < 10; i++) h = record(h, i, null, i, 5);
    expect(h.past).toEqual([5, 6, 7, 8, 9]);
    const u = undo(h, 10)!;
    expect(u.history.future).toEqual([10]);
    expect(record(u.history, 9, null, 100).future).toEqual([]);
  });
  it('never coalesces across an undo', () => {
    let h = emptyHistory<string>();
    h = record(h, 'a', 'k', 0);
    const u = undo(h, 'b')!;
    h = record(u.history, 'a', 'k', 10);
    expect(h.past).toEqual(['a']);
  });
});

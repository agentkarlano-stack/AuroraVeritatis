import { describe, expect, it } from 'vitest';
import { shouldPlayIntro } from './intro';

const base = { mode: 'session' as const, reducedMotion: false, path: '/', shownThisSession: false, loginPending: false, replay: false };

describe('intro triggers', () => {
  it('plays once per session by default, and again after a fresh sign-in', () => {
    expect(shouldPlayIntro(base)).toBe(true);
    expect(shouldPlayIntro({ ...base, shownThisSession: true })).toBe(false);
    expect(shouldPlayIntro({ ...base, shownThisSession: true, loginPending: true })).toBe(true);
  });
  it('respects every/login/off', () => {
    expect(shouldPlayIntro({ ...base, mode: 'every', shownThisSession: true })).toBe(true);
    expect(shouldPlayIntro({ ...base, mode: 'login' })).toBe(false);
    expect(shouldPlayIntro({ ...base, mode: 'login', loginPending: true })).toBe(true);
    expect(shouldPlayIntro({ ...base, mode: 'off', loginPending: true })).toBe(false);
  });
  it('never plays with reduced motion or on the social card route; replays on request', () => {
    expect(shouldPlayIntro({ ...base, reducedMotion: true, replay: true })).toBe(false);
    expect(shouldPlayIntro({ ...base, path: '/share/card' })).toBe(false);
    expect(shouldPlayIntro({ ...base, mode: 'off', replay: true })).toBe(true);
  });
});

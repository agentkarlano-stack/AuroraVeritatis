import { describe, expect, it } from 'vitest';
import { DEFAULT_INTRO_MODE, VISIT_GAP_MS, isFreshVisit, resolveIntroMode, shouldPlayIntro } from './intro';

const base = { mode: 'session' as const, reducedMotion: false, path: '/', shownThisSession: false, loginPending: false, replay: false };
const ORIGIN = 'https://aurorav.app';
const NOW = 1_000_000_000;

describe('intro triggers', () => {
  it('session mode: once per session, and again after a fresh sign-in', () => {
    expect(shouldPlayIntro(base)).toBe(true);
    expect(shouldPlayIntro({ ...base, shownThisSession: true })).toBe(false);
    expect(shouldPlayIntro({ ...base, shownThisSession: true, loginPending: true })).toBe(true);
  });
  it('default visit mode: plays on a fresh visit and after sign-in, not otherwise', () => {
    const v = { ...base, mode: 'visit' as const, shownThisSession: true };
    expect(shouldPlayIntro({ ...v, freshVisit: true })).toBe(true);
    expect(shouldPlayIntro({ ...v, freshVisit: false })).toBe(false);
    expect(shouldPlayIntro({ ...v, freshVisit: false, loginPending: true })).toBe(true);
  });
  it('respects every/login/off', () => {
    expect(shouldPlayIntro({ ...base, mode: 'every', shownThisSession: true })).toBe(true);
    expect(shouldPlayIntro({ ...base, mode: 'login' })).toBe(false);
    expect(shouldPlayIntro({ ...base, mode: 'login', loginPending: true })).toBe(true);
    expect(shouldPlayIntro({ ...base, mode: 'off', loginPending: true, freshVisit: true })).toBe(false);
  });
  it('never plays with reduced motion or on the social card route; replays on request', () => {
    expect(shouldPlayIntro({ ...base, reducedMotion: true, replay: true })).toBe(false);
    expect(shouldPlayIntro({ ...base, mode: 'visit', freshVisit: true, path: '/share/card' })).toBe(false);
    expect(shouldPlayIntro({ ...base, mode: 'off', replay: true })).toBe(true);
  });
});

describe('fresh visits', () => {
  const v = { navigationType: 'navigate', referrer: '', origin: ORIGIN, lastSeen: NOW - 60_000, now: NOW };
  it('counts arrivals from outside the site and returns after inactivity', () => {
    expect(isFreshVisit(v)).toBe(true); // typed address, bookmark or new tab
    expect(isFreshVisit({ ...v, referrer: 'https://www.google.com/' })).toBe(true);
    expect(isFreshVisit({ ...v, lastSeen: null, navigationType: 'reload' })).toBe(true);
    expect(isFreshVisit({ ...v, navigationType: 'reload', lastSeen: NOW - VISIT_GAP_MS - 1 })).toBe(true);
  });
  it('does not count reloads, back/forward or links inside an ongoing visit', () => {
    expect(isFreshVisit({ ...v, navigationType: 'reload' })).toBe(false);
    expect(isFreshVisit({ ...v, navigationType: 'back_forward' })).toBe(false);
    expect(isFreshVisit({ ...v, referrer: `${ORIGIN}/radar` })).toBe(false);
  });
});

describe('intro preference', () => {
  it('gives the new default to users without an explicit choice and keeps explicit ones', () => {
    expect(DEFAULT_INTRO_MODE).toBe('visit');
    expect(resolveIntroMode(null)).toBe('visit');
    expect(resolveIntroMode(undefined, 'session')).toBe('visit'); // the previous default
    expect(resolveIntroMode(undefined, 'off')).toBe('off');
    expect(resolveIntroMode(undefined, 'login')).toBe('login');
    expect(resolveIntroMode('session', 'off')).toBe('session'); // a new explicit choice wins
    expect(resolveIntroMode('bogus', 'bogus')).toBe('visit');
  });
});

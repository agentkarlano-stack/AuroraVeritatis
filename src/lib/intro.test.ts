import { describe, expect, it } from 'vitest';
import { VISIT_GAP_MS, decideIntro, isFreshVisit, resolveIntroExperience, type IntroExperience } from './intro';

const base = { reducedMotion: false, path: '/', cinematicSeen: false, cinematicThisSession: false };
const load = (pref: IntroExperience | null, extra: Partial<Parameters<typeof decideIntro>[0]> = {}) => decideIntro({ ...base, pref, trigger: 'load', freshVisit: true, ...extra });

describe('intro decision', () => {
  it('automatic default: cinematic on the first-ever visit, brand afterwards', () => {
    expect(load(null)).toBe('cinematic');
    expect(load(null, { cinematicSeen: true })).toBe('brand');
    expect(decideIntro({ ...base, pref: null, trigger: 'login', cinematicSeen: false })).toBe('brand');
  });

  it('cinematic: each new visit, but never twice in one browser session', () => {
    expect(load('cinematic', { cinematicSeen: true })).toBe('cinematic');
    expect(load('cinematic', { cinematicThisSession: true })).toBe('brand');
    expect(decideIntro({ ...base, pref: 'cinematic', trigger: 'return', cinematicSeen: true })).toBe('cinematic');
  });

  it('brand never shows the film; none shows nothing', () => {
    expect(load('brand')).toBe('brand');
    expect(decideIntro({ ...base, pref: 'brand', trigger: 'login' })).toBe('brand');
    expect(load('none')).toBe('none');
    expect(decideIntro({ ...base, pref: 'none', trigger: 'login' })).toBe('none');
  });

  it('reloads and internal loads inside a visit play nothing', () => {
    for (const pref of [null, 'brand', 'cinematic'] as const) expect(load(pref, { freshVisit: false })).toBe('none');
  });

  it('respects reduced motion, data saver and the social-card route; previews play on request', () => {
    expect(load('cinematic', { reducedMotion: true })).toBe('none');
    expect(decideIntro({ ...base, pref: 'none', trigger: 'preview-cinematic', reducedMotion: true })).toBe('none');
    expect(load(null, { saveData: true })).toBe('brand');
    expect(load('brand', { path: '/share/card' })).toBe('none');
    expect(decideIntro({ ...base, pref: 'none', trigger: 'preview-cinematic' })).toBe('cinematic');
    expect(decideIntro({ ...base, pref: 'none', trigger: 'preview-brand' })).toBe('brand');
  });
});

describe('intro preference', () => {
  it('keeps explicit choices and carries legacy settings over', () => {
    expect(resolveIntroExperience('cinematic', 'off')).toBe('cinematic');
    expect(resolveIntroExperience(null, 'off')).toBe('none');
    expect(resolveIntroExperience(undefined, null, 'off')).toBe('none');
    expect(resolveIntroExperience(null, 'every')).toBe('brand');
    expect(resolveIntroExperience(null, 'login')).toBe('brand');
    expect(resolveIntroExperience(null, 'visit', 'session')).toBeNull();
    expect(resolveIntroExperience('bogus')).toBeNull();
  });
});

describe('fresh visits', () => {
  const NOW = 1_800_000_000_000;
  const ORIGIN = 'https://aurorav.app';
  const v = { navigationType: 'navigate', referrer: '', origin: ORIGIN, lastSeen: NOW - 60_000, now: NOW };
  it('counts arrivals from outside the site and returns after inactivity', () => {
    expect(isFreshVisit(v)).toBe(true);
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

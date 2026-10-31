import { describe, expect, it } from 'vitest';
import { systemState } from './systemStatus';

describe('system status', () => {
  const ready = { routeReady: true, authSettled: true, configOk: true, online: true };
  it('is Active only when the first page rendered and the configuration check settled', () => {
    expect(systemState(ready)).toBe('active');
    expect(systemState({ ...ready, routeReady: false })).toBe('loading');
    expect(systemState({ ...ready, authSettled: false })).toBe('loading');
  });
  it('reports a failed configuration and offline truthfully instead of Active', () => {
    expect(systemState({ ...ready, configOk: false })).toBe('limited');
    expect(systemState({ ...ready, online: false })).toBe('offline');
  });
});

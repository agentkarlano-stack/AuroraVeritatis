import { describe, expect, it } from 'vitest';
import { describeDevice, isMissingFunction, signedOutMessage } from './sessions';

describe('sessions', () => {
  it('describes devices from the user agent only', () => {
    expect(describeDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36')).toBe('Chrome on Windows');
    expect(describeDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1')).toBe('Safari on iPhone');
    expect(describeDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 Edg/126.0')).toBe('Edge on macOS');
    expect(describeDevice('Mozilla/5.0 (Android 14; Mobile; rv:128.0) Gecko/128.0 Firefox/128.0')).toBe('Firefox on Android');
    expect(describeDevice('')).toBe('Unknown device');
  });
  it('explains sign-outs and recognises a pending database update', () => {
    expect(signedOutMessage('ended_by_takeover')).toMatch(/another device/);
    expect(signedOutMessage(null)).toBeNull();
    expect(isMissingFunction({ code: 'PGRST202' })).toBe(true);
    expect(isMissingFunction({ code: '42501' })).toBe(false);
  });
});

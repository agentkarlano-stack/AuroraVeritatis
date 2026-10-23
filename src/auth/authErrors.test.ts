import { describe, expect, it } from 'vitest';
import { friendlyAuthError } from './authErrors';

describe('friendlyAuthError', () => {
  it('explains breached and weak passwords', () => {
    expect(friendlyAuthError({ code: 'weak_password', reasons: ['pwned'], message: 'Password is known to be weak and easy to guess' })).toMatch(/known data breaches/);
    expect(friendlyAuthError({ code: 'weak_password', reasons: ['length'], message: 'Password should be at least 10 characters' })).toMatch(/too weak/);
  });
  it('passes other messages through', () => {
    expect(friendlyAuthError(new Error('Invalid login credentials'))).toBe('Invalid login credentials');
    expect(friendlyAuthError(null)).toMatch(/try again/);
  });
});

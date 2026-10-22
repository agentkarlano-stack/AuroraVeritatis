import { describe, expect, it } from 'vitest';
import { friendlyLinkError } from './linkErrors';

describe('friendlyLinkError', () => {
  it('explains links opened in another browser', () => {
    expect(friendlyLinkError('invalid request: both auth code and code verifier should be non-empty')).toMatch(/different browser/);
  });
  it('explains expired links', () => {
    expect(friendlyLinkError('Email link is invalid or has expired')).toMatch(/expired or has already been used/);
  });
  it('passes other messages through', () => {
    expect(friendlyLinkError('Something else')).toBe('Something else');
  });
});

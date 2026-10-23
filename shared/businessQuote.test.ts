import { describe, expect, it } from 'vitest';
import { FUNCTIONS, quoteEmail, validateQuote } from './businessQuote';

const good = {
  organization: 'University of Innsbruck, Dept. of Political Science',
  contact: 'Dr. A. Example',
  email: 'A.Example@uibk.ac.at',
  country: 'Austria',
  industry: 'University or research institute',
  seats: '20',
  functions: [FUNCTIONS[0], FUNCTIONS[2], 'Not an option'],
  aiUsage: 'Moderate (daily use by several people)',
  duration: '12 months',
  details: 'Seminar use in the summer term.',
  consent: true,
};

describe('business quote requests', () => {
  it('accepts a complete request and normalises it', () => {
    const r = validateQuote(good);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.email).toBe('a.example@uibk.ac.at');
    expect(r.value.functions).toEqual([FUNCTIONS[0], FUNCTIONS[2]]);
    expect(r.freeMail).toBe(false);
    expect(validateQuote({ ...good, email: 'someone@gmail.com' })).toMatchObject({ ok: true, freeMail: true });
  });

  it('explains what is missing', () => {
    expect(validateQuote({ ...good, organization: '' })).toEqual({ ok: false, error: 'Please enter the organisation name.' });
    expect(validateQuote({ ...good, email: 'not-an-email' })).toMatchObject({ ok: false, error: expect.stringMatching(/business email/) });
    expect(validateQuote({ ...good, seats: '7' })).toMatchObject({ ok: false, error: expect.stringMatching(/number of users/) });
    expect(validateQuote({ ...good, seats: 'custom' })).toMatchObject({ ok: false, error: expect.stringMatching(/describe/) });
    expect(validateQuote({ ...good, functions: ['Not an option'] })).toMatchObject({ ok: false, error: expect.stringMatching(/at least one/) });
    expect(validateQuote({ ...good, consent: 'yes' })).toMatchObject({ ok: false, error: expect.stringMatching(/agree/) });
    expect(validateQuote(null)).toMatchObject({ ok: false });
  });

  it('escapes everything in the HTML email and never mentions prices', () => {
    const r = validateQuote({ ...good, organization: '<script>alert(1)</script> Corp', details: 'Use "quotes" & <b>tags</b>' });
    if (!r.ok) throw new Error(r.error);
    const m = quoteEmail(r.value, { freeMail: false, receivedAt: '2026-10-23T10:00:00Z', reference: 'Q-ABC123' });
    expect(m.html).not.toContain('<script>');
    expect(m.html).toContain('&lt;script&gt;');
    expect(m.html).toContain('&quot;quotes&quot; &amp; &lt;b&gt;');
    expect(m.subject).toContain('[Q-ABC123]');
    expect(`${m.text}${m.html}`).not.toMatch(/€|\$\d|price per/i);
  });
});

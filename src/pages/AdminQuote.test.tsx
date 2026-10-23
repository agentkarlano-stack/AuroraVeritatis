import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

const admin = { value: true };
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ status: 'signed-in' }) }));
vi.mock('../store/entitlements', () => ({ useEntitlements: () => ({ status: 'ready', isAdmin: admin.value }) }));

const { default: AdminQuote } = await import('./AdminQuote');
const render = () => renderToString(<MemoryRouter><AdminQuote /></MemoryRouter>);

describe('AdminQuote page', () => {
  it('renders the calculator for administrators only', () => {
    const html = render();
    expect(html).toContain('Quotation calculator');
    expect(html).toContain('N. Risk buffer on costs (%)');
    expect(html).toContain('Expected use');
    expect(html).toContain('Enter at least one cost');
    admin.value = false;
    const denied = render();
    expect(denied).toContain('This page is for administrators.');
    expect(denied).not.toContain('Quotation calculator');
  });
});

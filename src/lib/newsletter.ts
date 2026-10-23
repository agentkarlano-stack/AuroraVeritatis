/** POST helper for the newsletter endpoints (same-origin JSON). */
export async function newsletterPost(path: 'subscribe' | 'request', body: Record<string, unknown>): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch(`/api/newsletter/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
    return { ok: res.ok, message: data.message ?? data.error ?? (res.ok ? 'Done.' : 'Something went wrong. Please try again later.') };
  } catch {
    return { ok: false, message: 'Network error. Please try again.' };
  }
}

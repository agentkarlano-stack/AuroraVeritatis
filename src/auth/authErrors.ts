/**
 * Plain-language messages for password errors from Supabase Auth. With leaked-password protection on, Supabase rejects
 * passwords found in known breaches (Have I Been Pwned, checked by hash prefix; the password itself is never sent).
 */
export function friendlyAuthError(err: unknown): string {
  const e = (err ?? {}) as { code?: string; message?: string; reasons?: string[] };
  const message = e.message ?? 'Something went wrong. Please try again.';
  if (e.code === 'weak_password' || /weak|pwned|leaked|breach/i.test(message)) {
    if (e.reasons?.includes('pwned') || /pwned|leaked|breach/i.test(message)) {
      return 'This password appears in known data breaches, so it cannot be used. Choose a different password (a long passphrase works well).';
    }
    return 'This password is too weak. Use at least 10 characters; a long passphrase works well.';
  }
  return message;
}

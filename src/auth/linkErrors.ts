/** Plain-language versions of Supabase link errors (expired, already used, or opened in another browser). */
export function friendlyLinkError(message: string): string {
  if (/code verifier|code_verifier|flow state/i.test(message)) {
    return 'This link was opened in a different browser from the one that requested it. If you were confirming your email address, it is now confirmed: sign in with your password. Otherwise, request a new link in this browser.';
  }
  if (/expired|invalid/i.test(message)) return 'This link has expired or has already been used. Request a new one from the sign-in page.';
  return message;
}

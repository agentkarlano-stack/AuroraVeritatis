# Account recovery and access support

This is the support procedure for people who cannot get into their Aurora Veritatis account, or who think someone else
has. Support works only through auroraveritatissup@gmail.com and the `/admin` page. Never ask a user for their password,
a sign-in link, a recovery code or an access token, and never send them one by email that you created yourself.

## 1. Forgotten password (self-service)
1. The user opens **Sign in** → **Forgot password?** and enters their email.
2. Supabase sends a one-time reset link (valid about an hour). The link opens **Account** in recovery mode, where only
   the new-password form is shown.
3. Support needs to do nothing. If the email does not arrive, see section 4.

## 2. Someone else may be using the account
The user does this themselves, signed in on a device they trust:
1. **Account → Devices → Sign out of other devices.** Every other session ends, and its refresh tokens are deleted.
2. **Change the password** (Account → Security).
3. Check **Account → Devices** again; only the current device should be listed.

What stays true afterwards (see `docs/SECURITY.md`, "Sessions and account sharing"):
- A revoked device loses paid features and admin rights at once (`session_active()`).
- It can read its own synced notes until its access token expires (at most about one hour). The data belongs to the
  same account, so this window is accepted and documented.

If someone else changed the password, the user resets it (section 1), then does steps 1 to 3. If the mailbox itself is compromised, go to section 3.

## 3. The user cannot sign in and does not control the email any more
Aurora cannot verify identity by any other channel, so access is never moved to a new email on request.
1. Ask the user to recover the mailbox with their email provider first; then use section 1.
2. If the mailbox is lost for good, the user creates a new account. An administrator can then:
   - grant the same plan to the new account (**/admin → Manage** next to the account, with a reason such as "replacement
     account for lost mailbox"); and
   - add the new account to the same organisation seat (**/admin → Organisations**: remove the old email, add the new).
3. The old account keeps its data until it is deleted. Deletion requires signing in to it, or a GDPR erasure request
   handled by the owner in the Supabase dashboard after confirming the request came from the account's email.
4. Personal Intelligence Brain graphs are stored only in the user's browser; they are not on the server and cannot be
   recovered by support. Users can export them from the Brain page.

## 4. Emails do not arrive
- Ask the user to check spam and to add the sender domain to their contacts.
- Supabase limits auth emails per hour; ask the user to wait an hour before trying again rather than repeating requests.
- If several users report it, check the Supabase **Auth logs** and the Resend dashboard (delivery and bounces).

## 5. A displaced device ("signed out because the account was used elsewhere")
This only happens when an administrator has switched on **one active device per paid individual account**
(/admin → Account sharing). The newest sign-in wins. Free accounts and organisation seats are never affected.
If a user reports it and did not sign in elsewhere, treat it as section 2.

## 6. Recording
Every administrator action used above (grants, organisation seats, session policy) is written to the audit log shown on
`/admin`. Support emails are kept in the support inbox; do not copy personal data into GitHub issues or the vault.

/**
 * Integration Billing Config
 *
 * Configure who pays for each integration's API calls.
 *
 * - 'user': The calling user pays. THIS APP'S DEFAULT, including for any
 *   integration not listed here, so nobody can spend the owner's credits.
 * - 'developer': The app owner pays. Not used by this app; do not add it
 *   without a reason (a test fails if you do).
 *
 * Every integration requires a signed-in caller. Set `anonymous: true` on a
 * 'developer' integration to let signed-out visitors call it too — the owner
 * then pays for anyone who can reach the app.
 *
 * Integrations not listed here default to 'user' with sign-in required.
 *
 * IMPORTANT: any integration backed by per-user connected accounts (Google,
 * Composio) must be 'user' — the api-worker resolves the account from the
 * JWT subject. With 'developer' the app owner's JWT is forwarded, so every
 * signed-in user connects and acts on the app owner's account. Server code
 * that acts for a user in the background (e.g. a cron job) uses
 * `callComposio(env, ..., { asUser })` from 'deepspace/worker' instead.
 */

export const integrations: Record<
  string,
  { billing: 'developer' | 'user'; anonymous?: boolean }
> = {
  google: { billing: 'user' },
  composio: { billing: 'user' },
  // openai: { billing: 'developer', anonymous: true },
}

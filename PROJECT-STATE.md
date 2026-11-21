# Project state

Read this before changing anything. It exists because chat context does not
survive a new chat, a new surface, or an agent switch — this file does.

## What this is

A dispatch console for a small independent fleet, built for the DeepSpace
build exercise. **Deadline: Saturday 21 November 2026, 11:59 PM ET.**
Live URL target: `<name>.app.space`. A repo URL and a short writeup are also
required.

## Non-negotiable design decisions

1. **Dispatcher console, not a consumer marketplace.** One actor, one tab,
   legible in ninety seconds. Live two-sided rider/driver matching was cut
   deliberately — it needs two authenticated sessions and has dead air in the
   middle. This is the project's stated main tradeoff.
2. **Offers are private per driver, enforced at the Durable Object.**
   `offers.ownerField = 'driverId'`, and `driverId` MUST be the driver's
   **user id**, because `read: 'own'` resolves to
   `record.data[ownerField] === userId`. Display names live on `drivers`,
   keyed by the same user id.
3. **Background jobs act as a named user.** `JobContext` has no record API.
   Use `createUserToolExecutor(env, userId, ctx.signal)`, then
   `records.query` / `records.create` / `records.update` / `records.delete`.
   Every write is permission-checked as that user, so matching runs as the
   dispatcher and can create offers no driver could.
4. **The model never produces the fare total.** It returns a factor breakdown
   (`{name, cents, why}` per row); code sums the factors, clamps to
   floor/ceiling, and **asserts the sum equals the total**, rejecting and
   retrying once on mismatch. Log rejections. Never trust model arithmetic.
5. **Pricing needs ground truth.** Generate ~14 days of synthetic historical
   clears plus a digest (median by origin-destination pair, hourly
   multipliers, zone supply/demand). Without it every fare is unfalsifiable
   and the variance chart has no denominator.
6. **Payments are cut.** The platform offers Stripe Checkout (subscriptions,
   one-time, refunds), not Connect payouts, so a real payout flow is
   impossible. Say so in the writeup rather than faking Uber's money half.

## Verified against SDK 0.44.2

- `canRead` / `canUpdate` / `canCreate` are exported from `deepspace/worker`
  and are unit-testable with no Durable Object.
- `getRolePermissions` falls back to the `'*'` role, then denies.
- `isOwner` is `record.data[ownerField] === userId`, or `createdBy === userId`
  when no `ownerField` is set.
- Job tool names: `records.query|get|create|update|delete|deleteWhere`,
  plus `schema.*` and `user.*`.
- `enqueueJob(namespace, roomId, type, payload, opts)` enqueues from routes,
  actions and cron; `useJobs(roomId)` subscribes live, with no polling.
- Column storage is only `'number' | 'text'`.
- `deepspace/testing` ships a Playwright `users(2)` fixture for real
  two-session tests — the proper way to prove offer privacy end to end.

## Blocked on the machine, not the code

- `wrangler.toml` still has `DEEPSPACE_APP_ID = "__APP_ID__"`. Until
  `npx deepspace app init` runs, **`deepspace dev`, `vitest`, and `deploy` all
  refuse to start**. That requires a browser login, so it must happen on the
  developer's own machine.
- Commits in this repo are authored `Dispatch Dev <dev@localhost>` (this
  workspace had no git identity). Fix locally with
  `git commit --amend --reset-author` after setting a real identity.
- **Set the GitHub remote before the first deploy.** AGENTS.md: the deploy
  latches its git source from the checkout's remote at the app's first
  release, permanently.

## Open risk

The app owner is always `admin`, but any other account that signs in gets
`member`. As designed, a `member` can read the console but cannot dispatch or
override — so a reviewer signed into their own account sees a read-only
console. Decide before building the UI: make `requests`/`fares`
member-readable with dispatch admin-only, or hand the reviewer a seeded
driver session for the privacy demo. Do not fake it with a role switcher.

## Where things stand

Increment 0 complete at API level: scaffold, `offers` schema, 10/10 RBAC
assertions passing against the real predicate, `probe` job handler
typechecking, `tsc --noEmit` clean.

**Next: increment 1** — live skeleton on `.app.space`, then the pricing job
(increment 3) is the product. Load-bearing and never cut: pricing with the
reconcile assertion, the RBAC proof, the override/variance chart, and the
deploy. Cut in this order if time runs out: polish, map, chat.

# Project state

Read this before changing anything. It exists because chat context does not
survive a new chat, a new surface, or an agent switch — this file does.

## What this is

A dispatch console for a small independent fleet, built for the DeepSpace
build exercise. **Deadline: Saturday 21 November 2026, 11:59 PM ET.**
Live URL target: `<name>.app.space`. A repo URL and a short writeup are also
required.

## The assignment

Submission needs three things: a live URL at `<name>.app.space`, a repository
URL, and a short writeup covering **what was built, which DeepSpace
integrations were used, the main tradeoff, what the agent did, and what was
verified by hand**.

Rules that shape the build: at least **three** DeepSpace integrations doing real
work; a basic CRUD app is explicitly not enough; the scope must be finishable,
and a focused finished project beats a large incomplete one; anything left out
must be **explained**, not silently skipped. No confidential employer, school
or client material.

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

## Exception to AGENTS.md

AGENTS.md says not to set up GitHub unless the developer explicitly asks. The
assignment **requires a repository URL**, so GitHub is the intended source here
and the scaffold default does not apply. Set the remote *before* the first
deploy — the source is latched from the checkout's remote at the first release,
permanently.

## The build plan

Ten increments, each ending in something visibly working. Do not start the next
until the check passes.

| # | Increment | Time | Check |
|---|---|---|---|
| 0 | Two-account spike | 30m | ✅ done — RBAC proven, 10/10 |
| 1 | Live skeleton on `.app.space` | 40m | URL loads logged out, sign-in works |
| 2 | Data model + seed | 40m | 6 requests, 20 drivers, no duplicate rows |
| 3 | 🔒 Pricing job end-to-end | 85m | factors hand-add to the total; corrupted response rejected |
| 4 | Matching job | 40m | nearest free driver ranks first; re-rank on move |
| 5 | 🔒 Dispatch + driver view + RBAC | 55m | driver B sees one offer, driver C sees none |
| 6 | 🔒 Override + variance chart | 40m | readable delta traceable to rows |
| 7 | ✂️ Polish + demo script | 25m | 90-second walkthrough runs twice clean |
| 8 | Writeup + README + capture | 40m | submission text complete |
| 9 | 🔒 Ship | 25m | deployed URL verified logged in **and** out |

**Never cut:** 3, 5, 6, 9 — the reconcile assertion, the RBAC proof, the
variance chart and the deploy are the submission. **Cut order** if time runs
out: 7, then the map (list view instead), then chat.

## Writeup skeleton

- **Built:** a dispatch console for a small independent fleet — matching with
  reasons, explainable AI pricing, override capture, variance reporting.
- **Integrations:** records with per-collection RBAC, durable background jobs,
  cron, AI via the DeepSpace proxy.
- **Main tradeoff:** dispatcher console instead of a consumer marketplace — one
  actor, legible in one tab, at the cost of live two-sided matching. Payments
  cut because the platform offers Checkout, not Connect payouts.
- **Agent did:** scaffold, seed generator, scoring, factor pipeline, UI, chart.
- **Verified by hand:** ranking picks a sensible driver; factors reconcile to
  the total; driver B genuinely cannot see driver A's offer; and the model ran
  ~9% high on rain fares, caught in the data.

## Where things stand

Increment 0 complete at API level: scaffold, `offers` schema, 10/10 RBAC
assertions passing against the real predicate, `probe` job handler
typechecking, `tsc --noEmit` clean.

**Next: increment 1** — live skeleton on `.app.space`, then the pricing job
(increment 3) is the product. Load-bearing and never cut: pricing with the
reconcile assertion, the RBAC proof, the override/variance chart, and the
deploy. Cut in this order if time runs out: polish, map, chat.

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

## Machine notes

- `app init` is done: `wrangler.toml` carries the real `DEEPSPACE_APP_ID`.
  Commit that change.
- Git identity is set; the earlier `Dispatch Dev` commits can be re-authored
  with `git rebase -r --root --reset-author` if wanted (optional).
- **`origin` is a local `.bundle` file, not GitHub.** The assignment needs a
  repo URL, so create the GitHub repo and `git remote set-url origin <url>`
  **before the first deploy** (AGENTS.md: the source latches permanently).
- **Run vitest from a shell whose path starts with an uppercase `C:`**
  (PowerShell `Set-Location C:\Users\...`). From Git Bash (`/c/...`) every
  suite dies with "Vitest failed to find the current suite" - a drive-letter
  case mismatch, not a code bug.

## What is simulated, and what is real

Synthetic data is load-bearing here, not decoration. Say so plainly in the
writeup rather than dressing it up.

**Simulated:** the population and its history. A deterministic seed job
generates ~14 days of cleared fares plus the digest (median by
origin-destination pair, hourly multipliers, zone supply/demand), and seeds ~20
drivers and 6 requests. Deterministic so a reviewer can regenerate an identical
demo.

**Real:** every mechanism. RBAC enforced at the Durable Object, the job
pipeline, the actual model call, the factor sum-and-assert, override capture,
the variance computation.

The drivers must be real user records, not invented ids: `read: 'own'` resolves
to `record.data.driverId === userId`, so proving "driver B sees one offer,
driver C sees none" needs actual signed-in identities. Driver *behaviour* is
simulated - offers reach accepted/completed through seeded state, because
nobody is accepting rides during a 90-second demo. Claim "seeded demo fleet,
real enforcement"; never claim real riders.

One actor is enough for the product (the dispatcher). Nothing in the assignment
requires two people; two sessions only strengthen the offer-privacy proof, which
the unit tests already cover. Increment 5's driver view is optional.

## Reviewer access (decided)

The app owner is `admin`; anyone else who signs in is `member`. Decision:
`drivers`, `requests`, `fares` and `fareHistory` are **member-readable,
admin-write-only** (`src/schemas/dispatch-schema.ts`), so a reviewer in their
own account sees a populated console. `offers` stays private per driver - console
visibility never extends to it. Covered by tests in `src/spike/rbac.test.ts`.
No role switcher. The privacy demo uses seeded driver sessions / the Playwright
`users(2)` fixture.

## Honesty rules for the writeup

- Seeded drivers, requests and the ~14-day history are **synthetic**. Every
  generated row sets `synthetic = 1`; the UI must label them, and the writeup
  must say so.
- Only write a "verified by hand" finding that actually happened. The rain-fare
  bias is a *hypothesis to look for*, not a result, until the variance chart
  shows it.

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
  the total; driver B genuinely cannot see driver A's offer; and
  *(only if the variance chart actually shows it)* the model's bias on a
  condition such as rain, with the measured percentage.

## Where things stand

Increment 0 complete at API level: scaffold, `offers` schema, 10/10 RBAC
assertions passing against the real predicate, `probe` job handler
typechecking, `tsc --noEmit` clean.

Since then: console schemas added (member-read / admin-write) with 5 more RBAC
tests. Increment 1 code is done and verified locally: honest landing page
(prerendered, loads logged out), `/home` console shell with sign-in prompt, role
banner and live per-collection counts, real SEO text. `tsc`, eslint, 14/14
tests and `vite build` all pass.

**Deployed: https://dispatch.app.space** (21 Nov 2026). Source latched to GitHub
`ugiagbeanthony/dispatch-deepspace`, permanently - so DeepSpace `push/pull/workspace`
verbs refuse; ship with plain git + `npx deepspace deploy`.
Verified in a real browser, logged out: landing 200, `/home` shows the sign-in
prompt, the sign-in dialog opens (GitHub / Google / email), 0 console errors.
**Not yet verified:** an actual signed-in session (needs a human login), and that
a second account lands as read-only `member`.

**Increment 2 deployed and verified on the live app** (21 Nov 2026): the
dispatcher's "Seed demo data" button ran the `seed` job; counts read requests 6,
drivers 20, fares 0, fareHistory 140, all flagged synthetic, status succeeded.
*Pending a human re-click:* confirm a second seed leaves the counts unchanged
(upsert by fixed record id; unit-tested, not yet seen live).

Security fix made here: the job queue was open to any `member`, and the spike
`probe` job trusted a payload `asUserId`, so a reviewer could have run a job as
the dispatcher. The queue is now admin-only, `probe` is removed, and jobs act as
`job.enqueuedBy` (never a payload id).

The digest (pair medians, hourly multipliers, rain multiplier) is computed in
code from `fareHistory` by `buildDigest` in `src/seed/generate.ts`, not stored.
Ground truth rain multiplier in the generator is 1.12.

**Next: increment 3 (pricing) - the product.** Load-bearing: model returns
factor rows, code sums them and asserts sum == total, reject and retry once, log
rejections.

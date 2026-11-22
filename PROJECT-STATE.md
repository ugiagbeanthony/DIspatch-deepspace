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
3. **Who does the work.** Only the demo-data seed is a background job (admin-only
   queue; it acts as `job.enqueuedBy`, never a payload id, via
   `createUserToolExecutor`). Pricing, negotiation, offers, replies and
   notifications are **server actions** (`src/actions/`), which run with
   per-record RBAC OFF, so each checks the caller's role and ownership by hand.
   Pricing forwards the caller's token, so it bills the dispatcher's credits.
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

## Roles (decided, and built)

`admin` = owner (also a dispatcher, and the only one who can seed). `member` =
**dispatcher**, the default for anyone who signs in, so a reviewer can use the
app. `viewer` = **driver**: reads no console data, only offers addressed to them
and their own notifications. Console collections are member-read; requests are
member-create/update; fares are member-update (server creates); fleet and history
are admin-write. Offers, notifications and negotiations are written only by
server actions. The driver screen for a dispatcher is NOT a role switch: it
filters to offers whose `driverId` is your own id; "Get demo jobs" creates three
simulated jobs addressed to you.

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

## Where things stand (21 Nov 2026, evening)

Live at https://dispatch.app.space; code at
https://github.com/ugiagbeanthony/DIspatch-deepspace (source latched to GitHub,
so use plain git + `npx deepspace deploy`, not DeepSpace push/pull).

Built and deployed: seed job; AI pricing with the reconcile assertion, billed to
the caller; customer price on requests; negotiation with a simulated customer
(hidden maximum, counters, cancels); matching with reasons; offers privately per
driver; driver screen with accept/reject and a one-job-at-a-time demo clock
(10 s per trip-minute); in-app notifications; three-way price chart; roles;
README.md and WRITEUP.md. 106 automated tests.

Verified by hand on the live site: seeding (and re-seeding without duplicates),
real-model pricing, driver screen accept/countdown/lock, notification bell.
Covered only by automated tests: role permissions, reconcile rejections,
negotiation limits, one-job-at-a-time and locked-after-accept.
Not verified: billing to a *second* account's credits; a real `viewer` (driver)
account; two dispatchers at once.

Not built, and explained in WRITEUP.md: cron, email/push, map, chat, payments,
real two-sided matching, customer accounts, recurring contracts (rules drafted
in the untracked `src/contracts/`, unused).

Windows note: run vitest from a shell whose path starts with an uppercase `C:`.

# Dispatch

A dispatch console for a small independent taxi fleet, built on [DeepSpace](https://docs.deep.space) for the DeepSpace build exercise.

- **Live:** https://dispatch.app.space
- **Writeup:** [WRITEUP.md](./WRITEUP.md)

A dispatcher takes a phoned-in request, gets an AI fare suggestion whose factor rows must add up, negotiates the price with a simulated customer, then sends the job to the closest free driver. The driver side is a separate screen. The fleet, requests, fare history and the customer are **simulated and labelled as such**; the permissions, pricing checks, job rules and negotiation limits are real and run on the server.

## Try it (about 90 seconds)

Sign in with any account. You land as a **dispatcher** with a **private workspace**: your requests, prices and negotiations are visible only to you. The shared fleet and fare history are already seeded.

0. **Your demo requests:** a new account gets its own copy of six demo requests automatically on first visit (or add your own with the form). They are yours alone.

1. **Console:** your requests, plus the shared fleet and fare history.
2. **Price:** click **Price** on a request. It uses the AI model and is billed to *your* DeepSpace credits (roughly a tenth of a cent). Click the dollar amount to open the price details: factor rows and "Rows add up to the total ✓".
3. **Negotiate:** under **Price negotiation** you see *Customer proposed*, *AI suggests* and *Agreed*. Click **Quote AI price**: the simulated customer counters. Accept the counter, counter back, or **Reject job**. Quote far too high three times and the customer cancels.
4. **Send the job:** once a price is agreed, **Closest free drivers** unlocks, ranked with reasons. Click **Send job**, then **Simulate driver reply**. You get a notification. Once a driver accepts, the job is locked.
5. **Driver screen:** open **Driver** in the top bar and click **Get demo jobs**. You see what a driver sees: price, distance, minutes to pickup, accept or reject. Accept one: a countdown starts (10 seconds per trip-minute) and the others lock until it ends.
6. **Agreement charts:** the section at the bottom previews your three most recent agreements, each with the customer's offer, the AI's suggestion and the agreed price side by side. Click anywhere on it to open the full list on its own page.

If the shared counts (drivers, fare history) read zero, the owner must click **Seed demo data** (owner only).

## Roles

| Role | Who | Can do |
|---|---|---|
| `admin` | the app owner | everything a dispatcher can, plus seed demo data |
| `member` | **dispatcher**, the default for anyone who signs in | add requests, price, negotiate, send jobs, all on **their own** requests only |
| `viewer` | **driver** | see only jobs sent to them, and accept or reject; no access to requests, fleet or fares |

Requests, fares and negotiations are private to the dispatcher who created them (`read: 'own'`), and the server checks you own a request before it prices, negotiates or sends it. The fleet and fare history are shared and read-only. Offers and notifications are written only by server actions that check the caller. The permission rules are in `src/schemas/` and are tested in `src/spike/rbac.test.ts` against the SDK's real permission check.

## How it is built

| Area | Where |
|---|---|
| Collections and permissions | `src/schemas/` |
| Deterministic demo data and the history digest | `src/seed/generate.ts` |
| Fare pricing and the sum check (pure, tested) | `src/pricing/reconcile.ts` |
| Customer negotiation rules (pure, tested) | `src/negotiation/customer.ts` |
| Driver ranking | `src/matching/rank.ts` |
| Job, reply, demo-clock and notification rules | `src/dispatch/offers.ts` |
| Chart maths | `src/dispatch/variance.ts` |
| Server actions (`price`, `negotiate`, `send-offer`, `respond-offer`, `simulate-reply`, `demo-jobs`) | `src/actions/` |
| Seed background job | `src/jobs.ts` |
| Screens | `src/pages/(app)/home.tsx`, `.../(protected)/driver.tsx`, `src/components/` |

The rule the pricing code exists to enforce: **the model never produces the fare total.** It returns factor rows; the code sums them. The model must also state its own total, but only as a tripwire: if it disagrees with its own rows, the answer is rejected and retried once, then replaced by a price built from the history and labelled `fallback`.

## Run and test

```sh
npm install
npx deepspace auth login
npx deepspace dev start     # local dev server
npm run validate            # typecheck + unit tests
npx deepspace deploy        # ships to <app>.app.space
```

On Windows, run the tests from a shell whose path starts with an uppercase drive letter (PowerShell `Set-Location C:\...`). From Git Bash (`/c/...`) Vitest fails with "failed to find the current suite", which is a path-case problem, not a code bug.

## Who pays for AI

The signed-in dispatcher. The pricing action forwards the caller's own token to the model and refuses to run without it, and the app's integration routes bill the caller by default, so no one can spend the app owner's DeepSpace credits. `billing.test.ts` fails if that is ever changed back.

## Known limits

Demo data is synthetic, so the AI's prices are only as meaningful as 14 days of generated history. Jobs sent to drivers are owned by the driver (that is what keeps them private to a driver), so a dispatcher's list of jobs they sent is filtered on screen to their own rather than enforced by the database. Payments, real two-sided matching, scheduled jobs, email and push notifications, and recurring contracts are not built; see [WRITEUP.md](./WRITEUP.md) for why.

# Dispatch: writeup

**Live:** https://dispatch.app.space · **Repo:** https://github.com/ugiagbeanthony/DIspatch-deepspace

## What I built

A dispatch console for a small independent taxi fleet. A dispatcher takes a phoned-in request (route, hour, weather, and the price the customer offers) and works it end to end:

1. **Price it.** An AI model suggests a fare as a list of factor rows (route base, time of day, rain). The app adds the rows itself; that sum is the fare. The model never produces the total.
2. **Negotiate.** The customer's offer, the AI's suggestion and the dispatcher's quote are three different prices. A simulated customer accepts, counters or cancels; the dispatcher can accept a counter, counter back, or reject the job.
3. **Match and send.** Free drivers are ranked by distance and rating, each with a reason. A job goes out only at an agreed price.
4. **Driver side.** A driver sees only jobs addressed to them (price, distance, time to pickup, accept or reject), one at a time, on a compressed demo clock.
5. **Compare.** A chart shows customer-proposed vs AI vs agreed price for every request.

Both sides get in-app notifications.

## DeepSpace integrations used

- **Records with per-collection role permissions, enforced in the Durable Object.** Three roles map onto the app: owner (`admin`), dispatcher (`member`, the default for anyone who signs in) and driver (`viewer`). Drivers read none of the console. Offers use `ownerField: 'driverId'`, so a driver reads only their own offer, decided before anything is broadcast.
- **Live record subscriptions.** Every screen updates in real time from the record connection; no polling.
- **Server actions.** Pricing, negotiation, sending jobs, driver replies and notifications run as actions. They bypass per-record permissions, so each checks the caller's role and ownership by hand.
- **Background jobs** (durable job room, `useJobs`). The owner's demo-data seeding runs as a job; the job queue is admin-only.
- **AI through the DeepSpace proxy** (Claude Haiku 5.5). The pricing action forwards the signed-in dispatcher's own token, so the call is billed to their DeepSpace credits, not mine.

## Main tradeoff

I built a **dispatcher console, not a rider-and-driver marketplace.** A live two-sided market needs two signed-in people at once, which a reviewer cannot supply in a short look. So the other side of every interaction (drivers, the customer) is **simulated**, and the app says so wherever it shows them. What I gave up is real two-sided matching. What I kept is real enforcement: the permissions, the sum check, the one-job-at-a-time rule and the negotiation limits all run on the server.

I also **cut payments**: DeepSpace offers Stripe Checkout, not payouts to drivers, so I could not build a real money flow and chose not to fake one.

## What the agent did

I used Claude Code. It wrote the seed generator, the pricing pipeline and its checks, the negotiation rules, the server actions, the interface and the tests, and deployed the app. It also found a real security hole in the first version (any signed-in user could start a background job running as the dispatcher) and closed it. I made the product decisions, signed in to DeepSpace and GitHub, redirected the design several times (including to a dispatcher-first app), and tried the live app.

## What I verified by hand

On the live site:

- Seeding the demo data produced 6 requests, 20 drivers and 140 fare-history rows, all marked synthetic. Running it again left the counts unchanged.
- Pricing a request with the real model worked and produced a fare that appears in the chart.
- On the driver screen, accepting a job started a countdown and locked the other jobs until it finished. The notification bell updated.
- Using the app found two real bugs, both fixed: the pricing job read a record one level too shallow and failed with "Unknown zone: undefined", and a job accepted before the countdown existed locked the driver screen permanently.

Covered by **106 automated tests, not re-checked by hand**: the role permissions run against the SDK's real permission check (driver B cannot read driver A's offer; a driver cannot read requests or edit a price); the fare reconcile rule against a deliberately lying model (wrong arithmetic, junk text, decimals, out-of-range totals, a crash); the negotiation limits; and the one-job-at-a-time and locked-after-accept rules.

**Not verified:** that pricing bills the *dispatcher's* credits rather than mine. Testing it needs a second account. Likewise I did not sign in as a driver (`viewer`) account or a second dispatcher on the live site.

## What I left out, and why

- **Real two-sided matching and customer accounts:** needs several real people at once. A natural next step is customers sending their own requests for a dispatcher to price.
- **Payments:** no payout support on the platform (see above).
- **Recurring contracts and cancellation fees:** a good idea, and I wrote the rules, but did not ship them in the time available.
- **Scheduled jobs (cron), email and push notifications, a map, chat:** cut for time. Notifications are in-app only.
- **A third "customer" role:** DeepSpace has three roles, so drivers use `viewer`; a customer role would need a profile field instead.

## Honest limits

All fleet, request and history data is synthetic (14 days, 140 rows), so the AI's numbers are only as meaningful as that history. The chart also compares the AI with a hidden reference price that only exists because the data is synthetic; on the handful of fares I priced it sat a few percent above that reference, which is far too few to call a finding, and I have not measured the effect of rain. Every signed-in dispatcher shares the same demo requests, so two reviewers can overwrite each other's work.

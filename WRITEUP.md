# Curbline

Live: https://dispatch.app.space
Repo: https://github.com/ugiagbeanthony/DIspatch-deepspace

Curbline is a dispatch app for a small taxi fleet. A request comes in from a customer, an AI model suggests a fare, the dispatcher haggles the price with the customer, and the job goes to the closest free driver.

## What I built

There are three screens.

**The dispatcher console** is a queue. The request that has waited longest sits on top, and a note tells you when more are waiting. For each request the AI suggests a fare as a few rows (route base, time of day, rain), and the app adds the rows up itself. That sum is the fare, so the model never gives the total. If the model's own total disagrees with its rows, I throw the answer out and ask once more. If it fails again, the price comes from past fares instead and is labelled as a fallback.

The dispatcher then negotiates. The customer's offer, the AI's price and the dispatcher's quote are three different numbers, and a simulated customer can accept, counter or cancel. Once a price is agreed, the closest free drivers are listed with the reason for each, and the dispatcher sends the job. Agreement charts compare what the customer offered, what the AI suggested and what was agreed. Finished requests can be hidden, which keeps them on record.

**The driver screen** shows only the jobs sent to that driver: price, distance, minutes to pickup, and accept or reject. A driver can only do one job at a time, on a sped-up clock.

**The customer screen** lets a person ask for a ride and offer a price. A simulated dispatcher quotes from past fares and can be haggled with, but it never goes below its own hidden lowest price. Once agreed, a driver is matched.

Both sides get notifications inside the app.

## DeepSpace pieces I used

- **Records with role permissions**, enforced in the Durable Object. The owner is `admin`, dispatchers are `member` (the default for anyone who signs in) and drivers are `viewer`. Each dispatcher has a private workspace, so another dispatcher's account can't see their requests, fares or negotiations. A driver can read only their own offers.
- **Live subscriptions.** Screens update on their own, with no refreshing.
- **Server actions** for pricing, negotiating, sending jobs, driver replies and notifications. Actions skip the per-record permission check, so each one checks the caller's role and ownership itself.
- **Background jobs** for seeding the demo data. Only the owner can start one.
- **AI through the DeepSpace proxy** (Claude Haiku 5.5). The pricing call uses the signed-in person's own token, so it's billed to their credits and not mine.

## The main tradeoff

I made a dispatcher console and not a rider-and-driver marketplace. A live two-sided market needs two people signed in at once, and a reviewer can't supply that in a quick look. So the other side of every interaction (the drivers, the customer, and the dispatcher on the customer screen) is simulated, and the app labels it that way. What I gave up is real two-sided matching. What I kept is real enforcement: the permissions, the sum check, the one-job-at-a-time rule and the negotiation limits all run on the server.

I also cut payments. DeepSpace has Stripe Checkout but no payouts to drivers, so I couldn't build a real money flow and didn't want to fake one.

## What Claude Code did

I built this with Claude Code. It wrote the demo data, the pricing logic and its checks, the negotiation rules, the server actions, the screens and the tests, and it deployed the app. It also caught two real holes in what it had built: any signed-in user could have started a background job running as the dispatcher, and the starter template billed the app owner by default, so anyone signed in could have spent my credits. Both are fixed, and a test fails if the billing one ever comes back.

I made the product decisions, signed in to DeepSpace and GitHub, changed direction several times (including to a dispatcher-first app), and tried the live site.

## What I checked by hand

On the live site:

- Seeding the demo data gave 20 drivers and 140 fare-history rows, all marked as synthetic. Running it again changed nothing.
- Pricing a request with the real model worked and showed up in the charts.
- On the driver screen, accepting a job started a countdown and locked the other jobs until it finished. The notification bell updated.
- Who pays for the AI: before the test my DeepSpace account showed 11 AI calls ($0.0041). I signed in as a different account, priced a request (the details said "Priced by the model", so a real call ran), negotiated, sent the job, and the simulated driver accepted and finished it. Afterwards my account still showed exactly 11 calls, so that call was billed to the other account.
- Using the app turned up two bugs, both fixed. One was a record read one level too shallow ("Unknown zone: undefined"). The other was a job accepted before the countdown existed that locked the driver screen for good.

152 automated tests cover the rest, and I haven't re-checked these by hand: the role permissions (run against the SDK's real permission check), the fare rule against a model made to lie, the negotiation limits, and the one-job-at-a-time rules. The customer screen, Hide, the request queue note and "Receive a new request" have only been tested this way and not yet tried on the live site.

## What I left out

- **A real customer reaching a real dispatcher.** Incoming requests come from simulated customers, and the customer screen talks to a simulated dispatcher. Joining them is the obvious next step, but it needs two real people and a way to tell customers from dispatchers, which the three DeepSpace roles can't do on their own.
- **Payments**, for the reason above.
- **Recurring contracts** (a regular customer with the same trip every day), scheduled jobs, email and push notifications, a map and chat. I ran out of time. Notifications are in-app only.

## Limits

All the fleet, request and history data is synthetic, so the AI's prices are only as meaningful as 14 days of generated history. The charts also compare the AI with a hidden reference price that exists only because the data is fake. On the few fares I priced it sat a few percent above that, which is too few to call a finding, and I haven't measured the effect of rain. Jobs sent to drivers belong to the driver, which is what keeps them private to one driver, so a dispatcher's list of jobs they sent is filtered on screen and not enforced by the database. Everything else in a dispatcher's workspace is enforced by the permission rules.

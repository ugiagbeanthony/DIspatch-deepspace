# Curbline

A dispatch app for a small taxi fleet, built on [DeepSpace](https://docs.deep.space) for the DeepSpace build exercise.

- Live: https://dispatch.app.space (the app is called Curbline, but the web address keeps its original name)
- Writeup: [WRITEUP.md](./WRITEUP.md)

A request comes in from a customer. The dispatcher gets an AI fare suggestion whose rows have to add up, haggles the price with a simulated customer, and sends the job to the closest free driver. There are three screens: the dispatcher console, a driver screen, and a customer screen where you ask for a ride and haggle with a simulated dispatcher.

The fleet, the customer and (on the customer screen) the dispatcher are simulated, and the app labels them that way. The permissions, price checks, job rules and negotiation limits are real and run on the server.

## Try it

Sign in with any account. You start as a dispatcher with your own private workspace, so your requests, prices and negotiations are visible only to you. The shared fleet and fare history are already set up.

1. **Incoming requests.** A new account gets six requests from simulated customers on its first visit. **Receive a new request** brings in another. The console is a queue: the request that has waited longest is on top, three are shown, and a note says how many more are unattended. **See all** opens the rest.
2. **Price one.** Click **Price**. It uses the AI model and costs your own DeepSpace credits, about a tenth of a cent. Open **Details** to see the price rows and the "Rows add up to the total ✓" check.
3. **Negotiate.** You'll see what the customer proposed, what the AI suggests, and what's agreed. Click **Quote AI price** and the simulated customer will counter. Accept it, counter back, or **Reject job**. Quote far too high three times and the customer cancels.
4. **Send the job.** Once a price is agreed, the closest free drivers appear with a reason for each. Click **Send job**, then **Simulate driver reply**. You'll get a notification. Once a driver accepts, the job is locked.
5. **Driver screen.** Open **Driver** in the top bar and click **Get demo jobs**. You see what a driver sees: price, distance, minutes to pickup, accept or reject. Accept one and a countdown starts (10 seconds per trip-minute). The other jobs stay locked until it ends.
6. **Customer screen.** Open **Customer**, pick a trip and offer a price. A simulated dispatcher quotes from past fares. Accept it, counter it (it comes down toward you but never below its own hidden lowest price) or cancel. Once agreed, the closest free driver is matched.
7. **Agreement charts.** The bottom of the console shows your latest three agreements, with the customer's offer, the AI's suggestion and the agreed price side by side. Click anywhere on it for the full list.

A few things worth knowing:

- Lists show the latest few and let you expand the rest. A request or job that still needs you always stays visible.
- **Hide** only works on a finished request: completed, rejected, or cancelled by the customer. It keeps the request on record.
- If the drivers or fare history read zero, the owner needs to click **Seed demo data**. Only the owner can.

## Who can do what

| Role | Who | What they can do |
|---|---|---|
| `admin` | the app owner | everything a dispatcher can, plus seed the demo data |
| `member` | dispatcher (the default for anyone who signs in) | receive requests, price, negotiate, send jobs and hide finished ones, all on their own requests |
| `viewer` | driver | see only the jobs sent to them, and accept or reject |
| any signed-in account | customer | ask for rides on the customer screen and see only their own |

Requests, prices and negotiations belong to the dispatcher who received them. The server checks that you own a request before it prices, negotiates or sends it. The fleet and fare history are shared and read-only. Offers and notifications are only written by server actions that check who's calling. The permission rules live in `src/schemas/` and are tested against the SDK's real permission check in `src/spike/rbac.test.ts`.

## Where things are

- `src/schemas/`: collections and permissions
- `src/seed/generate.ts`: the demo data and the history the pricing uses
- `src/pricing/reconcile.ts`: fare pricing and the sum check
- `src/negotiation/customer.ts`: the dispatcher negotiating with the simulated customer
- `src/customer/trip.ts`: the customer negotiating with the simulated dispatcher
- `src/matching/rank.ts`: ranking drivers
- `src/dispatch/`: job rules, the request queue, Hide and the chart maths
- `src/actions/`: the server actions (`price`, `negotiate`, `send-offer`, `respond-offer`, `simulate-reply`, `demo-jobs`, `demo-requests`, `incoming-request`, `trip-request`, `trip-move`)
- `src/jobs.ts`: the seeding job
- `src/pages/` and `src/components/`: the screens

The rule the pricing code exists to enforce is that the model never gives the fare total. It returns rows, and the code adds them up. The model also states its own total, but only as a check. If that disagrees with its rows, the answer is rejected and retried once, then replaced by a price worked out from past fares and labelled `fallback`.

## Run and test

```sh
npm install
npx deepspace auth login
npx deepspace dev start     # local dev server
npm run validate            # typecheck + unit tests
npx deepspace deploy        # ships to <app>.app.space
```

On Windows, run the tests from a shell whose path starts with an uppercase drive letter (PowerShell, `Set-Location C:\...`). From Git Bash (`/c/...`) Vitest fails with "failed to find the current suite". That's a path-case problem and not a bug in the code.

## Who pays for the AI

Whoever is signed in. The pricing action passes the caller's own token to the model and refuses to run without it, and the app's integration routes bill the caller by default, so nobody can spend the owner's credits. `billing.test.ts` fails if that's ever changed back.

## Limits

- The demo data is synthetic, so the AI's prices are only as meaningful as 14 days of generated history.
- Jobs sent to drivers belong to the driver, which is what keeps them private to one driver. So a dispatcher's list of the jobs they sent is filtered on screen and not enforced by the database.
- A real customer's request never reaches a real dispatcher. The console's incoming requests come from simulated customers, and the customer screen talks to a simulated dispatcher. Connecting them is future work.
- Not built: payments, scheduled jobs, email and push notifications, and recurring contracts. [WRITEUP.md](./WRITEUP.md) says why.

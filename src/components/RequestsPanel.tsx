/**
 * The dispatcher's work list. For each request: price it (on YOUR DeepSpace
 * credits), negotiate the price with the simulated customer (their proposal vs
 * the AI's suggestion vs yours), then see ranked drivers with reasons, send a
 * job at the agreed price, and watch the answer come back.
 *
 * Every write that needs trust (pricing, negotiating, sending jobs, replies)
 * goes through a server action. The "adds up" line is computed here by summing the stored factor
 * rows on their own, an independent look at the invariant the server enforced.
 */

import { useEffect, useState } from 'react'
import { useQuery } from 'deepspace'
import { Button } from '@/components/ui'
import { callAction } from '../lib/call-action'
import { rankDrivers, type DriverLite } from '../matching/rank'
import { jobPhase, sendBlockReason, usd } from '../dispatch/offers'
import { parseDollars, parseTurns } from '../negotiation/customer'

interface RequestData {
  origin: string
  destination: string
  originLat: number
  originLng: number
  hour: number
  proposedCents?: number
  weather: string
  status: string
  synthetic?: number
}

interface FareData {
  requestId: string
  factors: string
  modelTotalCents: number
  finalCents: number
  overridden?: number
  overrideReason?: string
  rejections?: number
  rejectionNotes?: string
  source?: string
  referenceCents?: number
}

interface DriverData {
  userId: string
  name: string
  lat: number
  lng: number
  rating: number
  status: string
}

interface OfferData {
  acceptedAt?: number
  driverId: string
  requestId: string
  fareCents: number
  distanceKm: number
  etaMin: number
  status: string
  simulated?: number
}

interface NegotiationData {
  requestId: string
  status: string
  round: number
  quoteCents: number
  counterCents: number
  agreedCents: number
  log: string
}

interface Factor {
  name: string
  cents: number
  why: string
}

function parseFactors(json: string): Factor[] {
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? (v as Factor[]) : []
  } catch {
    return []
  }
}

const STATUS_LABEL: Record<string, string> = {
  open: 'New',
  priced: 'Priced',
  negotiating: 'Negotiating',
  agreed: 'Price agreed',
  cancelled: 'Customer cancelled',
  rejected: 'Rejected',
  offered: 'Sent to driver',
  accepted: 'Accepted',
  declined: 'Declined',
}

export function RequestsPanel() {
  const requests = useQuery<RequestData>('requests')
  const fares = useQuery<FareData>('fares')
  const drivers = useQuery<DriverData>('drivers')
  const offers = useQuery<OfferData>('offers')
  const negotiations = useQuery<NegotiationData>('negotiations')

  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [quotes, setQuotes] = useState<Record<string, string>>({})

  const setError = (id: string, msg: string | null) =>
    setErrors((e) => {
      const next = { ...e }
      if (msg) next[id] = msg
      else delete next[id]
      return next
    })

  const fareFor = (requestId: string) => fares.records.find((f) => f.data.requestId === requestId)
  const fleet: DriverLite[] = drivers.records.map((d) => ({ recordId: d.recordId, ...d.data }))
  const nameOf = (userId: string) => fleet.find((d) => d.userId === userId)?.name ?? userId

  async function run(id: string, action: string, params: Record<string, unknown>, then?: () => void) {
    setBusy(`${id}:${action}`)
    setError(id, null)
    const r = await callAction(action, params)
    setBusy(null)
    if (!r.ok) setError(id, r.error)
    else then?.()
  }

  async function sendQuote(requestId: string) {
    const parsed = parseDollars(quotes[requestId] ?? '')
    if ('error' in parsed) return setError(requestId, parsed.error)
    await run(requestId, 'negotiate', { requestId, move: 'quote', cents: parsed.cents }, () =>
      setQuotes((q) => ({ ...q, [requestId]: '' })),
    )
  }

  const rows = [...requests.records].sort((a, b) => a.recordId.localeCompare(b.recordId))

  return (
    <section data-testid="requests-panel" className="mt-8">
      <h2 className="text-lg font-semibold">Requests</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Pricing uses the AI model and is billed to your own DeepSpace credits (about a tenth of a cent each).
      </p>
      {requests.status === 'ready' && rows.length === 0 && (
        <p className="mt-3 text-sm text-muted-foreground">No requests yet. Add one above.</p>
      )}

      <ul className="mt-3 space-y-3">
        {rows.map((r) => {
          const fareRec = fareFor(r.recordId)
          const fare = fareRec?.data
          const factors = fare ? parseFactors(fare.factors) : []
          const sum = factors.reduce((n, f) => n + f.cents, 0)
          const adds = fare ? sum === fare.modelTotalCents : false
          const isOpen = open === r.recordId
          const myOffers = offers.records.filter((o) => o.data.requestId === r.recordId)
          const neg = negotiations.records.find((n) => n.data.requestId === r.recordId)?.data
          const proposed = r.data.proposedCents
          const agreed = neg?.status === 'agreed'
          const negOpen = !neg || neg.status === 'open' || neg.status === 'countered'
          const turns = parseTurns(neg?.log)
          // A job can go out only at an agreed price, and only until a driver accepts.
          const blocked =
            sendBlockReason(myOffers.map((o) => o.data)) ??
            (agreed ? null : 'Agree a price with the customer first.')
          const ranked = fare
            ? rankDrivers({ lat: r.data.originLat, lng: r.data.originLng }, fleet).slice(0, 3)
            : []

          return (
            <li
              key={r.recordId}
              id={`request-${r.recordId}`}
              data-testid={`request-${r.recordId}`}
              className="rounded-lg border border-border bg-card p-4"
            >
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {r.data.origin} <span className="text-muted-foreground">to</span> {r.data.destination}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {String(r.data.hour).padStart(2, '0')}:00 · {r.data.weather} ·{' '}
                    <span data-testid={`status-${r.recordId}`}>{STATUS_LABEL[r.data.status] ?? r.data.status}</span>
                    {r.data.synthetic === 1 ? ' · synthetic request' : ''}
                  </div>
                </div>

                {fare && (
                  <button
                    className="text-left underline-offset-4 hover:underline"
                    onClick={() => setOpen(isOpen ? null : r.recordId)}
                    aria-expanded={isOpen}
                  >
                    <span data-testid={`fare-${r.recordId}`} className="text-lg font-semibold">
                      {usd(fare.finalCents)}
                    </span>
                    <span className="ml-2 text-xs text-muted-foreground">{agreed ? 'agreed' : 'AI suggestion'}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{isOpen ? 'hide price details' : 'price details'}</span>
                  </button>
                )}

                <Button
                  onClick={() => run(r.recordId, 'price', { requestId: r.recordId }, () => setOpen(r.recordId))}
                  disabled={busy !== null || agreed || myOffers.length > 0}
                >
                  {busy === `${r.recordId}:price` ? 'Pricing…' : fare ? 'Re-price' : 'Price'}
                </Button>
              </div>

              {errors[r.recordId] && (
                <p data-testid={`error-${r.recordId}`} className="mt-2 text-sm text-red-400">
                  {errors[r.recordId]}
                </p>
              )}

              {fare && isOpen && (
                <div className="mt-4 border-t border-border pt-3 text-sm">
                  <table className="w-full">
                    <tbody>
                      {factors.map((fc, i) => (
                        <tr key={i} className="align-top">
                          <td className="py-1 pr-3 font-medium">{fc.name}</td>
                          <td className="py-1 pr-3 text-right tabular-nums">{usd(fc.cents)}</td>
                          <td className="py-1 text-muted-foreground">{fc.why}</td>
                        </tr>
                      ))}
                      <tr className="border-t border-border">
                        <td className="py-1 pr-3 font-semibold">Suggested</td>
                        <td className="py-1 pr-3 text-right font-semibold tabular-nums">{usd(fare.modelTotalCents)}</td>
                        <td className="py-1 text-muted-foreground" data-testid={`reconcile-${r.recordId}`}>
                          {adds ? 'Rows add up to the total ✓' : `Rows add to ${usd(sum)}: MISMATCH`}
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  <p className="mt-3 text-muted-foreground">
                    {fare.source === 'fallback'
                      ? 'The model failed twice, so this fare comes from the historical digest instead.'
                      : 'Priced by the model; the total is the sum of its rows, computed by the app.'}
                    {fare.rejections
                      ? ` ${fare.rejections} answer${fare.rejections > 1 ? 's' : ''} rejected: ${fare.rejectionNotes}`
                      : ''}
                  </p>

                  {/* Negotiate with the simulated customer */}
                  <h3 className="mt-5 font-semibold">Price negotiation</h3>
                  <dl className="mt-2 grid grid-cols-3 gap-3">
                    <div>
                      <dt className="text-muted-foreground">Customer proposed</dt>
                      <dd data-testid={`proposed-${r.recordId}`} className="font-semibold">
                        {proposed ? usd(proposed) : 'none'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">AI suggests</dt>
                      <dd className="font-semibold">{usd(fare.modelTotalCents)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Agreed</dt>
                      <dd data-testid={`agreed-${r.recordId}`} className="font-semibold">
                        {agreed ? usd(neg!.agreedCents) : '—'}
                      </dd>
                    </div>
                  </dl>

                  {!proposed && (
                    <p className="mt-2 text-muted-foreground">
                      This request has no customer price. Add a new request, or ask the owner to re-seed.
                    </p>
                  )}

                  {proposed && negOpen && (
                    <div className="mt-3 space-y-3">
                      {neg?.status === 'countered' && (
                        <p data-testid={`counter-${r.recordId}`} className="font-medium">
                          The customer counter-offers {usd(neg.counterCents)}.
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        {neg?.status === 'countered' ? (
                          <Button
                            disabled={busy !== null}
                            onClick={() => run(r.recordId, 'negotiate', { requestId: r.recordId, move: 'accept-counter' })}
                          >
                            Accept {usd(neg.counterCents)}
                          </Button>
                        ) : (
                          <Button
                            disabled={busy !== null}
                            onClick={() => run(r.recordId, 'negotiate', { requestId: r.recordId, move: 'accept-proposed' })}
                          >
                            Accept customer&apos;s {usd(proposed)}
                          </Button>
                        )}
                        <Button
                          variant="secondary"
                          disabled={busy !== null}
                          onClick={() =>
                            run(r.recordId, 'negotiate', { requestId: r.recordId, move: 'quote', cents: fare.modelTotalCents })
                          }
                        >
                          Quote AI price {usd(fare.modelTotalCents)}
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={busy !== null}
                          onClick={() => run(r.recordId, 'negotiate', { requestId: r.recordId, move: 'reject' })}
                        >
                          Reject job
                        </Button>
                      </div>
                      <div className="flex flex-wrap items-end gap-2">
                        <label className="text-sm">
                          <span className="mb-1 block text-muted-foreground">
                            {neg?.status === 'countered' ? 'Or counter with ($)' : 'Or quote your own price ($)'}
                          </span>
                          <input
                            data-testid={`quote-input-${r.recordId}`}
                            className="h-9 w-28 rounded-md border border-border bg-background px-2"
                            value={quotes[r.recordId] ?? ''}
                            onChange={(e) => setQuotes({ ...quotes, [r.recordId]: e.target.value })}
                          />
                        </label>
                        <Button variant="secondary" disabled={busy !== null} onClick={() => sendQuote(r.recordId)}>
                          Send quote
                        </Button>
                      </div>
                    </div>
                  )}

                  {agreed && (
                    <p data-testid={`neg-result-${r.recordId}`} className="mt-3 font-medium">
                      Price agreed at {usd(neg!.agreedCents)}. You can now send the job to a driver.
                    </p>
                  )}
                  {neg?.status === 'cancelled' && (
                    <p data-testid={`neg-result-${r.recordId}`} className="mt-3 font-medium">
                      The customer cancelled: they will not pay that much.
                    </p>
                  )}
                  {neg?.status === 'rejected' && (
                    <p data-testid={`neg-result-${r.recordId}`} className="mt-3 font-medium">
                      You rejected this job.
                    </p>
                  )}

                  {turns.length > 0 && (
                    <ul className="mt-3 space-y-1 text-muted-foreground">
                      {turns.map((t, k) => (
                        <li key={k}>
                          <span className="font-medium text-foreground">
                            {t.from === 'dispatcher' ? 'You' : 'Customer (simulated)'}:
                          </span>{' '}
                          {t.note}
                          {t.cents > 0 ? ` ${usd(t.cents)}` : ''}
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Match a driver */}
                  <h3 className="mt-5 font-semibold">Closest free drivers</h3>
                  {ranked.length === 0 && <p className="mt-1 text-muted-foreground">No free drivers.</p>}
                  {blocked && (
                    <p data-testid={`send-locked-${r.recordId}`} className="mt-1 text-muted-foreground">
                      {blocked}
                    </p>
                  )}
                  <ul className="mt-2 space-y-2">
                    {ranked.map((rk, i) => {
                      const sent = myOffers.some((o) => o.data.driverId === rk.driver.userId)
                      return (
                        <li key={rk.driver.userId} className="flex flex-wrap items-center gap-3">
                          <div className="min-w-0 flex-1">
                            <span className="font-medium">
                              {i + 1}. {rk.driver.name}
                            </span>{' '}
                            <span className="text-muted-foreground">(simulated) · {rk.reason}</span>
                          </div>
                          <Button
                            variant="secondary"
                            disabled={busy !== null || sent || blocked !== null}
                            onClick={() =>
                              run(r.recordId, 'send-offer', {
                                requestId: r.recordId,
                                driverUserId: rk.driver.userId,
                              })
                            }
                          >
                            {sent ? 'Sent' : blocked ? 'Locked' : busy === `${r.recordId}:send-offer` ? 'Sending…' : 'Send job'}
                          </Button>
                        </li>
                      )
                    })}
                  </ul>

                  {/* Replies */}
                  {myOffers.length > 0 && (
                    <>
                      <h3 className="mt-5 font-semibold">Jobs sent</h3>
                      <ul className="mt-2 space-y-2">
                        {myOffers.map((o) => (
                          <li key={o.recordId} className="flex flex-wrap items-center gap-3">
                            <span className="flex-1">
                              {nameOf(o.data.driverId)} · {usd(o.data.fareCents)} ·{' '}
                              <span data-testid={`offer-status-${o.recordId}`} className="font-medium">
                                {o.data.status === 'accepted'
                                  ? jobPhase(o.data, now) === 'done'
                                    ? 'completed'
                                    : 'accepted · on the way'
                                  : o.data.status}
                              </span>
                            </span>
                            {o.data.status === 'pending' && o.data.driverId.startsWith('seed_') && (
                              <Button
                                variant="secondary"
                                disabled={busy !== null}
                                onClick={() => run(r.recordId, 'simulate-reply', { offerId: o.recordId })}
                              >
                                Simulate driver reply
                              </Button>
                            )}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

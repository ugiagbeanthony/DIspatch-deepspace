/**
 * The dispatcher's work list. For each request: price it (on YOUR DeepSpace
 * credits), adjust the price with a reason, see ranked drivers with reasons,
 * send a job, and watch the answer come back.
 *
 * Writes that need trust (pricing, sending jobs, replies) go through server
 * actions; the price adjustment is a direct update the dispatcher's role
 * allows. The "adds up" line is computed here by summing the stored factor
 * rows on their own, an independent look at the invariant the server enforced.
 */

import { useEffect, useState } from 'react'
import { useMutations, useQuery } from 'deepspace'
import { Button } from '@/components/ui'
import { callAction } from '../lib/call-action'
import { rankDrivers, type DriverLite } from '../matching/rank'
import { jobPhase, sendBlockReason, usd } from '../dispatch/offers'
import { validateAdjustment } from '../dispatch/variance'

interface RequestData {
  origin: string
  destination: string
  originLat: number
  originLng: number
  hour: number
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
  offered: 'Sent to driver',
  accepted: 'Accepted',
  declined: 'Declined',
}

export function RequestsPanel() {
  const requests = useQuery<RequestData>('requests')
  const fares = useQuery<FareData>('fares')
  const drivers = useQuery<DriverData>('drivers')
  const offers = useQuery<OfferData>('offers')
  const fareWrites = useMutations<Partial<FareData>>('fares')

  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [form, setForm] = useState<Record<string, { price: string; reason: string }>>({})

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

  async function saveAdjustment(requestId: string, fareId: string, suggested: number) {
    const f = form[requestId] ?? { price: '', reason: '' }
    const v = validateAdjustment(suggested, f.price, f.reason)
    if ('error' in v) return setError(requestId, v.error)
    setError(requestId, null)
    try {
      await fareWrites.put(fareId, {
        finalCents: v.value.finalCents,
        overridden: v.value.overridden ? 1 : 0,
        overrideReason: v.value.overrideReason,
      })
    } catch (e) {
      setError(requestId, e instanceof Error ? e.message : 'Could not save the price')
    }
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
          const blocked = sendBlockReason(myOffers.map((o) => o.data))
          const ranked = fare
            ? rankDrivers({ lat: r.data.originLat, lng: r.data.originLng }, fleet).slice(0, 3)
            : []
          const f = form[r.recordId] ?? { price: fare ? (fare.finalCents / 100).toFixed(2) : '', reason: '' }

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
                    {fare.overridden === 1 && (
                      <span className="ml-2 text-xs text-muted-foreground">adjusted from {usd(fare.modelTotalCents)}</span>
                    )}
                    <span className="ml-2 text-xs text-muted-foreground">{isOpen ? 'hide price details' : 'price details'}</span>
                  </button>
                )}

                <Button
                  onClick={() => run(r.recordId, 'price', { requestId: r.recordId }, () => setOpen(r.recordId))}
                  disabled={busy !== null}
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

                  {/* Adjust the price */}
                  <div className="mt-4 flex flex-wrap items-end gap-3">
                    <label className="text-sm">
                      <span className="mb-1 block text-muted-foreground">Your price ($)</span>
                      <input
                        data-testid={`adjust-price-${r.recordId}`}
                        className="h-9 w-28 rounded-md border border-border bg-background px-2"
                        value={f.price}
                        onChange={(e) => setForm({ ...form, [r.recordId]: { ...f, price: e.target.value } })}
                      />
                    </label>
                    <label className="min-w-[12rem] flex-1 text-sm">
                      <span className="mb-1 block text-muted-foreground">Why (required if you change it)</span>
                      <input
                        data-testid={`adjust-reason-${r.recordId}`}
                        className="h-9 w-full rounded-md border border-border bg-background px-2"
                        value={f.reason}
                        onChange={(e) => setForm({ ...form, [r.recordId]: { ...f, reason: e.target.value } })}
                      />
                    </label>
                    <Button
                      variant="secondary"
                      onClick={() => saveAdjustment(r.recordId, fareRec!.recordId, fare.modelTotalCents)}
                    >
                      Save price
                    </Button>
                  </div>
                  {fare.overridden === 1 && fare.overrideReason && (
                    <p className="mt-2 text-muted-foreground">Your reason: {fare.overrideReason}</p>
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

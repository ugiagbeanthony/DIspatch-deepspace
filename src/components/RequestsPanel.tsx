/**
 * Requests and their fares. Everyone signed in can read this; only the
 * dispatcher gets Price buttons (`enqueue` is passed only for an admin, since
 * the job queue is admin-only).
 *
 * The "adds up" line is computed here, in the browser, by summing the stored
 * factor rows on their own and comparing to the stored total. It is a second,
 * independent look at the invariant the job already enforced.
 */

import { useState } from 'react'
import { useQuery } from 'deepspace'
import type { JobView } from 'deepspace'
import { Button } from '@/components/ui'

interface RequestData {
  origin: string
  destination: string
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
  rejections?: number
  rejectionNotes?: string
  source?: string
  referenceCents?: number
}

interface Factor {
  name: string
  cents: number
  why: string
}

const usd = (cents: number) =>
  `${cents < 0 ? '-' : ''}$${(Math.abs(cents) / 100).toFixed(2)}`

function parseFactors(json: string): Factor[] {
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? (v as Factor[]) : []
  } catch {
    return []
  }
}

export function RequestsPanel({
  enqueue,
  jobs,
}: {
  enqueue?: (type: string, payload?: unknown) => Promise<string>
  jobs?: JobView[]
}) {
  const requests = useQuery<RequestData>('requests')
  const fares = useQuery<FareData>('fares')
  const [open, setOpen] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fareFor = (requestId: string) =>
    fares.records.find((f) => f.data.requestId === requestId)?.data
  const jobFor = (requestId: string) =>
    jobs?.find((j) => j.type === 'price' && (j.payload as { requestId?: string } | undefined)?.requestId === requestId)

  async function price(requestId: string) {
    setError(null)
    try {
      await enqueue?.('price', { requestId })
      setOpen(requestId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start pricing')
    }
  }

  const rows = [...requests.records].sort((a, b) => a.recordId.localeCompare(b.recordId))

  return (
    <section data-testid="requests-panel" className="mt-8">
      <h2 className="text-lg font-semibold">Requests</h2>
      {requests.status === 'ready' && rows.length === 0 && (
        <p className="mt-2 text-sm text-muted-foreground">No requests yet.</p>
      )}
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

      <ul className="mt-3 space-y-3">
        {rows.map((r) => {
          const fare = fareFor(r.recordId)
          const job = jobFor(r.recordId)
          const busy = job?.status === 'queued' || job?.status === 'running'
          const factors = fare ? parseFactors(fare.factors) : []
          const sum = factors.reduce((n, f) => n + f.cents, 0)
          const adds = fare ? sum === fare.modelTotalCents : false

          return (
            <li
              key={r.recordId}
              data-testid={`request-${r.recordId}`}
              className="rounded-lg border border-border bg-card p-4"
            >
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {r.data.origin} <span className="text-muted-foreground">to</span> {r.data.destination}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {String(r.data.hour).padStart(2, '0')}:00 · {r.data.weather}
                    {r.data.synthetic === 1 ? ' · synthetic request' : ''}
                  </div>
                </div>

                {fare && (
                  <button
                    className="text-left text-sm underline-offset-4 hover:underline"
                    onClick={() => setOpen(open === r.recordId ? null : r.recordId)}
                  >
                    <span data-testid={`fare-${r.recordId}`} className="text-lg font-semibold">
                      {usd(fare.finalCents)}
                    </span>
                  </button>
                )}

                {enqueue && (
                  <Button onClick={() => price(r.recordId)} disabled={busy}>
                    {busy ? `Pricing… ${Math.round((job?.progress ?? 0) * 100)}%` : fare ? 'Re-price' : 'Price'}
                  </Button>
                )}
              </div>

              {job?.status === 'failed' && (
                <p className="mt-2 text-sm text-red-400">Pricing failed: {job.error}</p>
              )}

              {fare && open === r.recordId && (
                <div className="mt-4 border-t border-border pt-3 text-sm">
                  <table className="w-full">
                    <tbody>
                      {factors.map((f, i) => (
                        <tr key={i} className="align-top">
                          <td className="py-1 pr-3 font-medium">{f.name}</td>
                          <td className="py-1 pr-3 text-right tabular-nums">{usd(f.cents)}</td>
                          <td className="py-1 text-muted-foreground">{f.why}</td>
                        </tr>
                      ))}
                      <tr className="border-t border-border">
                        <td className="py-1 pr-3 font-semibold">Total</td>
                        <td className="py-1 pr-3 text-right font-semibold tabular-nums">
                          {usd(fare.modelTotalCents)}
                        </td>
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
                  {fare.referenceCents !== undefined && fare.referenceCents > 0 && (
                    <p className="mt-1 text-muted-foreground">
                      Demo reference (hidden rules behind the synthetic history): {usd(fare.referenceCents)}, model{' '}
                      {(((fare.modelTotalCents - fare.referenceCents) / fare.referenceCents) * 100).toFixed(1)}% vs
                      reference.
                    </p>
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

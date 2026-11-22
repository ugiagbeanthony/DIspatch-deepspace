/**
 * Driver screen: what a driver sees. Only jobs addressed to YOU, each with the
 * price, how far the pickup is, roughly how long it takes to get there, and
 * Accept / Reject. A driver never sees the request queue or sets a price.
 *
 * Open this with a dispatcher account and "Get demo jobs" and you see exactly
 * this screen, filled with jobs from a simulated dispatcher. It is not a role
 * switch: you only ever see offers whose driverId is your own id, enforced by
 * the same rule a real driver (viewer role) gets.
 */

import { useState } from 'react'
import { useQuery, useUser } from 'deepspace'
import { Button } from '@/components/ui'
import { callAction } from '../../../lib/call-action'
import { usd } from '../../../dispatch/offers'

interface OfferData {
  driverId: string
  requestId: string
  origin: string
  destination: string
  distanceKm: number
  fareCents: number
  etaMin: number
  status: string
  simulated?: number
}

export default function DriverPage() {
  const { user } = useUser()
  const offers = useQuery<OfferData>('offers')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Mine only, even for a role that can read more.
  const mine = offers.records
    .filter((o) => o.data.driverId === user?.id)
    .sort((a, b) => a.recordId.localeCompare(b.recordId))
  const isDriverRole = user?.role === 'viewer'

  async function act(label: string, action: string, params: Record<string, unknown> = {}) {
    setBusy(label)
    setError(null)
    const r = await callAction(action, params)
    setBusy(null)
    if (!r.ok) setError(r.error)
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-12 text-foreground">
      <h1 className="text-3xl font-bold tracking-tight">Driver</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {isDriverRole
          ? 'Jobs sent to you by a dispatcher.'
          : 'This is what a driver sees. You are previewing it with your own account; a real driver account sees only this.'}
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={() => act('demo', 'demo-jobs')} disabled={busy !== null}>
          {busy === 'demo' ? 'Creating…' : mine.length ? 'Reset demo jobs' : 'Get demo jobs'}
        </Button>
        <span className="text-sm text-muted-foreground">Simulated jobs from a simulated dispatcher.</span>
      </div>
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      {offers.status === 'ready' && mine.length === 0 && (
        <p data-testid="driver-empty" className="mt-8 text-sm text-muted-foreground">
          No jobs yet. A dispatcher can send you one, or tap &quot;Get demo jobs&quot;.
        </p>
      )}

      <ul className="mt-6 space-y-3">
        {mine.map((o) => (
          <li key={o.recordId} data-testid={`job-${o.recordId}`} className="rounded-lg border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-medium">
                {o.data.origin} <span className="text-muted-foreground">to</span> {o.data.destination}
              </div>
              <div className="text-xl font-semibold">{usd(o.data.fareCents)}</div>
            </div>
            <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
              <div>
                <dt className="inline">Pickup: </dt>
                <dd className="inline text-foreground">{o.data.distanceKm} km away</dd>
              </div>
              <div>
                <dt className="inline">To pickup: </dt>
                <dd className="inline text-foreground">about {o.data.etaMin} min</dd>
              </div>
              {o.data.simulated === 1 && <div>Simulated job</div>}
            </dl>

            {o.data.status === 'pending' ? (
              <div className="mt-3 flex gap-2">
                <Button
                  disabled={busy !== null}
                  onClick={() => act(o.recordId, 'respond-offer', { offerId: o.recordId, status: 'accepted' })}
                >
                  Accept
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy !== null}
                  onClick={() => act(o.recordId, 'respond-offer', { offerId: o.recordId, status: 'declined' })}
                >
                  Reject
                </Button>
              </div>
            ) : (
              <p data-testid={`job-status-${o.recordId}`} className="mt-3 text-sm font-medium">
                {o.data.status === 'accepted' ? 'You accepted this job.' : 'You rejected this job.'}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

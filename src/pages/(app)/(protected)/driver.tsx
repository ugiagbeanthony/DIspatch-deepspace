/**
 * Driver screen: what a driver sees. Only jobs addressed to YOU, each with the
 * price, how far the pickup is, roughly how long it takes to get there, and
 * Accept / Reject. A driver never sees the request queue or sets a price.
 *
 * One job at a time: accepting starts a countdown from the job's ETA on the
 * demo clock (a minute of trip time is 10 real seconds). Until it finishes you
 * cannot accept another; the server enforces this, the disabled buttons only
 * reflect it.
 *
 * Open this with a dispatcher account and "Get demo jobs" and you see exactly
 * this screen, filled with jobs from a simulated dispatcher. It is not a role
 * switch: you only ever see offers whose driverId is your own id, enforced by
 * the same rule a real driver (viewer role) gets.
 */

import { useEffect, useState } from 'react'
import { useQuery, useUser } from 'deepspace'
import { Button } from '@/components/ui'
import { callAction } from '../../../lib/call-action'
import { recent } from '../../../lib/recent'
import { activeJob, jobPhase, remainingMs, usd } from '../../../dispatch/offers'

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
  acceptedAt?: number
}

/** How many jobs to show before the rest sit behind "Show all". */
const PREVIEW = 3

const clock = (ms: number) => {
  const s = Math.ceil(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export default function DriverPage() {
  const { user } = useUser()
  const offers = useQuery<OfferData>('offers')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [showAll, setShowAll] = useState(false)

  // Tick once a second so the countdown moves and finished jobs unlock the rest.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  // Mine only, even for a role that can read more.
  const mine = offers.records.filter((o) => o.data.driverId === user?.id)
  // Latest few; a job waiting for you, or one you are on, always stays visible.
  const { shown, sorted, more } = recent(mine, {
    when: (o) => Date.parse(o.createdAt) || 0,
    limit: PREVIEW,
    keep: (o) => {
      const phase = jobPhase(o.data, now)
      return phase === 'pending' || phase === 'in-progress'
    },
  })
  const list = showAll ? sorted : shown
  const current = activeJob(
    mine.map((o) => ({ ...o.data, id: o.recordId })),
    now,
  )

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

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={() => act('demo', 'demo-jobs')} disabled={busy !== null}>
          {busy === 'demo' ? 'Creating…' : mine.length ? 'Reset demo jobs' : 'Get demo jobs'}
        </Button>
      </div>
      {error && (
        <p data-testid="driver-error" className="mt-3 text-sm text-red-400">
          {error}
        </p>
      )}

      {current && (
        <p data-testid="driver-busy" className="mt-4 rounded-md border border-border bg-card p-3 text-sm">
          You are on a job. Finish it to accept another.
        </p>
      )}

      {offers.status === 'ready' && mine.length === 0 && (
        <p data-testid="driver-empty" className="mt-8 text-sm text-muted-foreground">
          No jobs yet. A dispatcher can send you one, or tap &quot;Get demo jobs&quot;.
        </p>
      )}

      <ul className="mt-6 space-y-3">
        {list.map((o) => {
          const phase = jobPhase(o.data, now)
          return (
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

              {phase === 'pending' && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    disabled={busy !== null || current !== null}
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
                  {current && <span className="text-xs text-muted-foreground">Finish your current job first.</span>}
                </div>
              )}
              {phase === 'in-progress' && (
                <p data-testid={`job-status-${o.recordId}`} className="mt-3 text-sm font-medium">
                  On the way to pickup · {clock(remainingMs(o.data, now))} left
                </p>
              )}
              {phase === 'done' && (
                <p data-testid={`job-status-${o.recordId}`} className="mt-3 text-sm font-medium">
                  Completed.
                </p>
              )}
              {phase === 'declined' && (
                <p data-testid={`job-status-${o.recordId}`} className="mt-3 text-sm font-medium">
                  You rejected this job.
                </p>
              )}
            </li>
          )
        })}
      </ul>

      {(more > 0 || showAll) && (
        <button
          data-testid="jobs-toggle"
          aria-expanded={showAll}
          onClick={() => setShowAll((v) => !v)}
          className="mt-4 text-sm font-medium underline underline-offset-4"
        >
          {showAll ? `Show only the latest ${PREVIEW}` : `Show all ${mine.length} jobs`}
        </button>
      )}
    </div>
  )
}

/**
 * Console shell (increment 1). Loads logged out with a sign-in prompt; once
 * signed in it shows who you are, your role, and live counts per collection.
 * Counts come from the real RBAC-checked records connection, so a `member`
 * (reviewer) sees the console data and an `admin` (dispatcher) will get the
 * dispatch controls in later increments.
 */

import { useState } from 'react'
import { AuthOverlay, useAuthProfileReady, useJobs, useQuery } from 'deepspace'
import type { JobView } from 'deepspace'
import { Button } from '@/components/ui'
import { RequestsPanel } from '@/components/RequestsPanel'
import { SCOPE_ID } from '../../constants'

const COLLECTIONS = [
  { name: 'requests', label: 'Requests' },
  { name: 'drivers', label: 'Drivers' },
  { name: 'fares', label: 'Fares' },
  { name: 'fareHistory', label: 'Fare history' },
] as const

function Count({ collection, label }: { collection: string; label: string }) {
  const { records, status } = useQuery(collection)
  const synthetic = records.filter((r) => (r.data as { synthetic?: number }).synthetic === 1).length
  return (
    <div data-testid={`count-${collection}`} className="rounded-lg border border-border bg-card p-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold text-foreground">
        {status === 'ready' ? records.length : '…'}
      </dd>
      {status === 'ready' && synthetic > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">{synthetic} synthetic</p>
      )}
    </div>
  )
}

/**
 * Dispatcher-only. Mounted only for an admin because the job queue is
 * admin-only (a member's job socket is refused). Re-running is safe: seed
 * rows have fixed ids and are upserted, never duplicated.
 */
function SeedPanel({
  jobs,
  connected,
  enqueue,
}: {
  jobs: JobView[]
  connected: boolean
  enqueue: (type: string, payload?: unknown) => Promise<string>
}) {
  const [error, setError] = useState<string | null>(null)
  const latest = jobs.find((j) => j.type === 'seed')
  const busy = latest?.status === 'queued' || latest?.status === 'running'

  async function seed() {
    setError(null)
    try {
      await enqueue('seed')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the seed job')
    }
  }

  return (
    <section data-testid="seed-panel" className="mt-8 rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-semibold">Demo data</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Seeds 20 drivers, 6 requests and 14 days of fare history, all labelled synthetic. Safe to
        run again: it overwrites the same rows instead of adding more.
      </p>
      <div className="mt-3 flex items-center gap-3">
        <Button onClick={seed} disabled={!connected || busy}>
          {busy ? 'Seeding…' : latest?.status === 'succeeded' ? 'Re-seed demo data' : 'Seed demo data'}
        </Button>
        {latest && (
          <span data-testid="seed-status" className="text-sm text-muted-foreground">
            {latest.status}
            {busy && latest.progress !== undefined ? ` ${Math.round(latest.progress * 100)}%` : ''}
            {latest.status === 'failed' && latest.error ? `: ${latest.error}` : ''}
          </span>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </section>
  )
}

/** One job connection shared by everything the dispatcher can trigger. */
function DispatcherTools() {
  const { jobs, connected, enqueue } = useJobs(SCOPE_ID)
  return (
    <>
      <SeedPanel jobs={jobs} connected={connected} enqueue={enqueue} />
      <RequestsPanel jobs={jobs} enqueue={connected ? enqueue : undefined} />
    </>
  )
}

export default function HomePage() {
  const { isSignedIn, user } = useAuthProfileReady({ requireUser: true })
  const [showAuth, setShowAuth] = useState(false)

  if (!isSignedIn || !user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-6 py-20">
        <div className="w-full max-w-sm rounded-lg border border-border bg-card p-8 text-center">
          <h1 className="text-lg font-semibold text-foreground">Dispatch console</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in to view the fleet, requests and fares.
          </p>
          <Button className="mt-6 w-full" onClick={() => setShowAuth(true)}>
            Sign in
          </Button>
        </div>
        {showAuth && <AuthOverlay onClose={() => setShowAuth(false)} />}
      </div>
    )
  }

  const isDispatcher = user.role === 'admin'

  return (
    <div className="mx-auto max-w-4xl px-6 py-12 text-foreground">
      <h1 className="text-3xl font-bold tracking-tight">Dispatch console</h1>
      <p data-testid="role-banner" className="mt-2 text-sm text-muted-foreground">
        Signed in as {user.name || user.email} ·{' '}
        {isDispatcher ? 'dispatcher (can dispatch and override)' : 'read-only view'}
      </p>

      <dl className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {COLLECTIONS.map((c) => (
          <Count key={c.name} collection={c.name} label={c.label} />
        ))}
      </dl>

      {isDispatcher ? <DispatcherTools /> : <RequestsPanel />}

      <p className="mt-8 text-sm text-muted-foreground">
        Fleet, requests and fare history are seeded demo data and labelled synthetic.
        {isDispatcher ? '' : ' Ask the dispatcher to seed it if the counts read zero.'}
      </p>
    </div>
  )
}

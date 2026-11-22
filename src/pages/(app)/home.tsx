/**
 * Console. Three audiences:
 *   signed out - a sign-in prompt;
 *   driver (viewer role) - no console, a pointer to the driver screen;
 *   dispatcher (member) or owner (admin) - the working console.
 * Only the owner also gets the "Seed demo data" control (a background job).
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AuthOverlay, useAuthProfileReady, useJobs, useQuery } from 'deepspace'
import type { JobView } from 'deepspace'
import { Button } from '@/components/ui'
import { useMine } from '@/lib/use-mine'
import { AddRequestForm } from '@/components/AddRequestForm'
import { RequestsPanel } from '@/components/RequestsPanel'
import { VariancePanel } from '@/components/VariancePanel'
import { SCOPE_ID } from '../../constants'

/** `mine`: your own rows (requests, fares). The fleet and history are shared. */
const COLLECTIONS = [
  { name: 'requests', label: 'Your requests', mine: true },
  { name: 'drivers', label: 'Drivers (shared)', mine: false },
  { name: 'fares', label: 'Your fares', mine: true },
  { name: 'fareHistory', label: 'Fare history (shared)', mine: false },
] as const

function Count({ collection, label, mine }: { collection: string; label: string; mine: boolean }) {
  const all = useQuery(collection)
  const own = useMine(collection)
  const { records: all_, status } = mine ? own : all
  const records = all_.filter((r) => (r.data as { hidden?: number }).hidden !== 1)
  const synthetic = records.filter((r) => (r.data as { synthetic?: number }).synthetic === 1).length
  return (
    <div data-testid={`count-${collection}`} className="rounded-lg border border-border bg-card p-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold text-foreground">{status === 'ready' ? records.length : '…'}</dd>
      {status === 'ready' && synthetic > 0 && <p className="mt-1 text-xs text-muted-foreground">{synthetic} synthetic</p>}
    </div>
  )
}

/** Owner only. Re-running is safe: seed rows have fixed ids and are upserted. */
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
      <h2 className="text-sm font-semibold">Demo data (owner)</h2>
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

/** The job connection is admin-only, so this mounts for the owner alone. */
function OwnerTools() {
  const { jobs, connected, enqueue } = useJobs(SCOPE_ID)
  return <SeedPanel jobs={jobs} connected={connected} enqueue={enqueue} />
}

export default function HomePage() {
  const { isSignedIn, user } = useAuthProfileReady({ requireUser: true })
  const [showAuth, setShowAuth] = useState(false)

  if (!isSignedIn || !user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-6 py-20">
        <div className="w-full max-w-sm rounded-lg border border-border bg-card p-8 text-center">
          <h1 className="text-lg font-semibold text-foreground">Dispatch console</h1>
          <p className="mt-2 text-sm text-muted-foreground">Sign in to take requests, price them and send jobs to drivers.</p>
          <Button className="mt-6 w-full" onClick={() => setShowAuth(true)}>
            Sign in
          </Button>
        </div>
        {showAuth && <AuthOverlay onClose={() => setShowAuth(false)} />}
      </div>
    )
  }

  // Drivers (viewer role) never see the console.
  if (user.role === 'viewer') {
    return (
      <div className="mx-auto max-w-xl px-6 py-16 text-foreground">
        <h1 className="text-2xl font-bold tracking-tight">You are signed in as a driver</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Drivers do not see the request queue or set prices. Your jobs are on the driver screen.
        </p>
        <Link
          to="/driver"
          className="mt-6 inline-flex rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
        >
          Open my jobs
        </Link>
      </div>
    )
  }

  const isOwner = user.role === 'admin'

  return (
    <div className="mx-auto max-w-4xl px-6 py-12 text-foreground">
      <h1 className="text-3xl font-bold tracking-tight">Dispatch console</h1>
      <p data-testid="role-banner" className="mt-2 text-sm text-muted-foreground">
        Signed in as {user.name || user.email} · {isOwner ? 'owner and dispatcher' : 'dispatcher'}
      </p>

      <dl className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {COLLECTIONS.map((c) => (
          <Count key={c.name} collection={c.name} label={c.label} mine={c.mine} />
        ))}
      </dl>

      <AddRequestForm />
      <RequestsPanel />
      <VariancePanel />
      {isOwner && <OwnerTools />}

    </div>
  )
}

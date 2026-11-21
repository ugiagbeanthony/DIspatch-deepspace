/**
 * Console shell (increment 1). Loads logged out with a sign-in prompt; once
 * signed in it shows who you are, your role, and live counts per collection.
 * Counts come from the real RBAC-checked records connection, so a `member`
 * (reviewer) sees the console data and an `admin` (dispatcher) will get the
 * dispatch controls in later increments.
 */

import { useState } from 'react'
import { AuthOverlay, useAuthProfileReady, useQuery } from 'deepspace'
import { Button } from '@/components/ui'

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

      <p className="mt-8 text-sm text-muted-foreground">
        Fleet, requests and fare history are seeded demo data and labelled synthetic.
        Seeding arrives in the next step, so counts read zero for now.
      </p>
    </div>
  )
}

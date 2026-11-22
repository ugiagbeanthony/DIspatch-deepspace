/**
 * Add a ride request, the way a dispatcher does when a call comes in.
 * Written straight to `requests` as the signed-in dispatcher (RBAC applies).
 */

import { useState } from 'react'
import { useMutations } from 'deepspace'
import { Button } from '@/components/ui'
import { ZONES } from '../seed/generate'
import { parseCustomerPrice } from '../negotiation/customer'

const selectCls =
  'h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground'

export function AddRequestForm() {
  const { create, ready } = useMutations('requests')
  const [origin, setOrigin] = useState(ZONES[0].name)
  const [destination, setDestination] = useState(ZONES[1].name)
  const [hour, setHour] = useState(8)
  const [weather, setWeather] = useState('clear')
  const [proposed, setProposed] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [added, setAdded] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setAdded(false)
    if (origin === destination) {
      setError('Pickup and drop-off must be different')
      return
    }
    const price = parseCustomerPrice(proposed)
    if ('error' in price) {
      setError(`Customer's price: ${price.error}`)
      return
    }
    const z = ZONES.find((x) => x.name === origin)!
    try {
      await create({
        origin,
        destination,
        originLat: z.lat,
        originLng: z.lng,
        hour,
        proposedCents: price.cents,
        weather,
        status: 'open',
        synthetic: 0,
      })
      setAdded(true)
      setProposed('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the request')
    }
  }

  return (
    <form
      data-testid="add-request"
      onSubmit={submit}
      className="mt-8 rounded-lg border border-border bg-card p-4"
    >
      <h2 className="text-sm font-semibold">New request</h2>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">Pickup</span>
          <select className={selectCls} value={origin} onChange={(e) => setOrigin(e.target.value)}>
            {ZONES.map((z) => (
              <option key={z.name}>{z.name}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">Drop-off</span>
          <select className={selectCls} value={destination} onChange={(e) => setDestination(e.target.value)}>
            {ZONES.map((z) => (
              <option key={z.name}>{z.name}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">Hour</span>
          <select className={selectCls} value={hour} onChange={(e) => setHour(Number(e.target.value))}>
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, '0')}:00
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">Weather</span>
          <select className={selectCls} value={weather} onChange={(e) => setWeather(e.target.value)}>
            <option>clear</option>
            <option>rain</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">Customer offers ($)</span>
          <input
            data-testid="add-request-price"
            className="h-9 w-28 rounded-md border border-border bg-background px-2 text-sm"
            placeholder="e.g. 18.00"
            value={proposed}
            onChange={(e) => setProposed(e.target.value)}
          />
        </label>
        <Button type="submit" disabled={!ready}>
          Add request
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      {added && <p className="mt-2 text-sm text-muted-foreground">Added. It appears in the list below.</p>}
    </form>
  )
}

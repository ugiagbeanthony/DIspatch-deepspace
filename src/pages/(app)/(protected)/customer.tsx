/**
 * Customer screen: the rider's point of view. You ask for a ride and offer a
 * price; a SIMULATED dispatcher quotes. Accept it, counter it, or cancel. Once a
 * price is agreed, the closest free (simulated) driver is matched.
 *
 * Only your own trips are shown, enforced by the permission rules.
 */

import { useState } from 'react'
import { useQuery, useUser } from 'deepspace'
import { Button } from '@/components/ui'
import { callAction } from '../../../lib/call-action'
import { usd } from '../../../dispatch/offers'
import { ZONES } from '../../../seed/generate'
import { parseCustomerPrice } from '../../../negotiation/customer'
import type { Turn } from '../../../customer/trip'

interface TripData {
  customerId: string
  origin: string
  destination: string
  hour: number
  weather: string
  offerCents: number
  quoteCents: number
  final: number
  status: string
  agreedCents: number
  driverName: string
  etaMin: number
  log: string
}

const selectCls = 'h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground'
const inputCls = 'h-9 w-28 rounded-md border border-border bg-background px-2 text-sm'

function turns(json: string): Turn[] {
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? (v as Turn[]) : []
  } catch {
    return []
  }
}

export default function CustomerPage() {
  const { user } = useUser()
  const trips = useQuery<TripData>('trips')
  const [origin, setOrigin] = useState(ZONES[0].name)
  const [destination, setDestination] = useState(ZONES[1].name)
  const [hour, setHour] = useState(8)
  const [weather, setWeather] = useState('clear')
  const [offer, setOffer] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [counters, setCounters] = useState<Record<string, string>>({})
  const [tripError, setTripError] = useState<Record<string, string>>({})

  // Mine only, newest first.
  const mine = trips.records
    .filter((t) => t.data.customerId === user?.id)
    .sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0))

  async function request(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const price = parseCustomerPrice(offer)
    if ('error' in price) return setError(price.error)
    setBusy('request')
    const r = await callAction('trip-request', { origin, destination, hour, weather, offerCents: price.cents })
    setBusy(null)
    if (!r.ok) setError(r.error)
    else setOffer('')
  }

  async function move(tripId: string, params: Record<string, unknown>) {
    setBusy(tripId)
    setTripError((e) => ({ ...e, [tripId]: '' }))
    const r = await callAction('trip-move', { tripId, ...params })
    setBusy(null)
    if (!r.ok) setTripError((e) => ({ ...e, [tripId]: r.error }))
  }

  async function sendCounter(tripId: string) {
    const parsed = parseCustomerPrice(counters[tripId] ?? '')
    if ('error' in parsed) return setTripError((e) => ({ ...e, [tripId]: parsed.error }))
    await move(tripId, { move: 'counter', cents: parsed.cents })
    setCounters((c) => ({ ...c, [tripId]: '' }))
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-12 text-foreground">
      <h1 className="text-3xl font-bold tracking-tight">Request a ride</h1>

      <form onSubmit={request} data-testid="trip-form" className="mt-6 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-end gap-3">
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
            <span className="mb-1 block text-muted-foreground">Your offer ($)</span>
            <input
              data-testid="trip-offer"
              className={inputCls}
              placeholder="e.g. 18.00"
              value={offer}
              onChange={(e) => setOffer(e.target.value)}
            />
          </label>
          <Button type="submit" disabled={busy !== null}>
            {busy === 'request' ? 'Requesting…' : 'Request ride'}
          </Button>
        </div>
        {error && (
          <p data-testid="trip-form-error" className="mt-2 text-sm text-red-400">
            {error}
          </p>
        )}
      </form>

      {trips.status === 'ready' && mine.length === 0 && (
        <p data-testid="trips-empty" className="mt-8 text-sm text-muted-foreground">
          No rides yet.
        </p>
      )}

      <ul className="mt-6 space-y-3">
        {mine.map((t) => {
          const log = turns(t.data.log)
          return (
            <li key={t.recordId} data-testid={`trip-${t.recordId}`} className="rounded-lg border border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium">
                  {t.data.origin} <span className="text-muted-foreground">to</span> {t.data.destination}
                </div>
                <div className="text-sm text-muted-foreground">
                  {String(t.data.hour).padStart(2, '0')}:00 · {t.data.weather}
                </div>
              </div>

              {t.data.status === 'quoted' && (
                <div className="mt-3 space-y-3">
                  <p data-testid={`trip-quote-${t.recordId}`} className="font-medium">
                    {t.data.final === 1 ? 'Final offer' : 'Dispatcher quotes'} {usd(t.data.quoteCents)}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button disabled={busy !== null} onClick={() => move(t.recordId, { move: 'accept' })}>
                      Accept {usd(t.data.quoteCents)}
                    </Button>
                    <Button variant="secondary" disabled={busy !== null} onClick={() => move(t.recordId, { move: 'cancel' })}>
                      Cancel
                    </Button>
                  </div>
                  {t.data.final !== 1 && (
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="text-sm">
                        <span className="mb-1 block text-muted-foreground">Or counter with ($)</span>
                        <input
                          data-testid={`trip-counter-${t.recordId}`}
                          className={inputCls}
                          value={counters[t.recordId] ?? ''}
                          onChange={(e) => setCounters({ ...counters, [t.recordId]: e.target.value })}
                        />
                      </label>
                      <Button variant="secondary" disabled={busy !== null} onClick={() => sendCounter(t.recordId)}>
                        Counter
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {t.data.status === 'agreed' && (
                <p data-testid={`trip-result-${t.recordId}`} className="mt-3 font-medium">
                  Booked at {usd(t.data.agreedCents)}.
                  {t.data.driverName ? ` ${t.data.driverName} (simulated) is about ${t.data.etaMin} min away.` : ''}
                </p>
              )}
              {t.data.status === 'cancelled' && (
                <p data-testid={`trip-result-${t.recordId}`} className="mt-3 font-medium">
                  Cancelled.
                </p>
              )}

              {tripError[t.recordId] && <p className="mt-2 text-sm text-red-400">{tripError[t.recordId]}</p>}

              {log.length > 0 && (
                <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                  {log.map((turn, k) => (
                    <li key={k}>
                      <span className="font-medium text-foreground">
                        {turn.from === 'customer' ? 'You' : 'Dispatcher (simulated)'}:
                      </span>{' '}
                      {turn.note}
                      {turn.cents > 0 ? ` ${usd(turn.cents)}` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

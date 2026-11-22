/**
 * Customer actions: the person asks for a ride and negotiates the price with a
 * SIMULATED dispatcher. The simulated dispatcher's replies are decided here
 * (customer/trip.ts) from the shared fare history, so the browser cannot make
 * them agree to anything. Any signed-in person may use these; each trip belongs
 * to its creator and nobody else can move it.
 */

import type { ActionHandler, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import { ZONES, buildDigest } from '../seed/generate'
import { estimateCents } from '../pricing/reconcile'
import { historyFromQuery } from '../pricing/inputs'
import { rankDrivers, type DriverLite } from '../matching/rank'
import { etaMinutes } from '../dispatch/offers'
import { MAX_CUSTOMER_PRICE_CENTS } from '../negotiation/customer'
import { customerMove, openTrip, type CustomerMove, type Trip, type Turn } from '../customer/trip'
import { fail, getFields, ok, str } from './common'

/** Most trips one person can have, so the list cannot be flooded. */
const MAX_TRIPS = 20

type Fields = Record<string, unknown>

async function estimateFor(
  tools: ActionTools,
  req: { origin: string; destination: string; hour: number; weather: string },
): Promise<number | string> {
  const hist = await tools.query('fareHistory', { limit: 500 })
  if (!hist.success) return 'Could not read fare history'
  try {
    return estimateCents(buildDigest(historyFromQuery(hist.data)), req)
  } catch (e) {
    return e instanceof Error ? e.message : 'No price estimate available'
  }
}

/** The closest free simulated driver, once a price is agreed. */
async function matchDriver(tools: ActionTools, lat: number, lng: number): Promise<{ name: string; etaMin: number } | null> {
  const found = await tools.query('drivers', { limit: 50 })
  if (!found.success) return null
  const fleet: DriverLite[] = found.data.records.map((r) => ({ recordId: r.recordId, ...(r.data as Omit<DriverLite, 'recordId'>) }))
  const best = rankDrivers({ lat, lng }, fleet)[0]
  return best ? { name: best.driver.name, etaMin: etaMinutes(best.km) } : null
}

function fieldsFor(trip: Trip): Fields {
  return {
    status: trip.status,
    round: trip.round,
    offerCents: trip.offerCents,
    quoteCents: trip.quoteCents,
    final: trip.final ? 1 : 0,
    agreedCents: trip.agreedCents,
    log: JSON.stringify(trip.log),
  }
}

function tripFrom(f: Fields): Trip {
  let log: Turn[] = []
  try {
    const v = JSON.parse(String(f.log ?? '[]'))
    if (Array.isArray(v)) log = v as Turn[]
  } catch {
    /* unreadable log starts empty */
  }
  return {
    status: (f.status as Trip['status']) ?? 'quoted',
    round: Number(f.round ?? 0),
    offerCents: Number(f.offerCents ?? 0),
    quoteCents: Number(f.quoteCents ?? 0),
    final: f.final === 1,
    agreedCents: Number(f.agreedCents ?? 0),
    log,
  }
}

export const tripRequest: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const origin = ZONES.find((z) => z.name === str(params.origin))
  const destination = ZONES.find((z) => z.name === str(params.destination))
  if (!origin || !destination) return fail('Pick a pickup and a drop-off from the list')
  if (origin.name === destination.name) return fail('Pickup and drop-off must be different')
  const hour = params.hour
  if (typeof hour !== 'number' || !Number.isInteger(hour) || hour < 0 || hour > 23) return fail('Pick an hour')
  const weather = params.weather === 'rain' ? 'rain' : 'clear'
  const offer = params.offerCents
  if (typeof offer !== 'number' || !Number.isInteger(offer) || offer <= 0) return fail('Enter the price you offer')
  if (offer > MAX_CUSTOMER_PRICE_CENTS) return fail('That price looks like a typo')

  const mine = await tools.query('trips', { where: { customerId: userId }, limit: MAX_TRIPS + 1 })
  if (mine.success && mine.data.records.length >= MAX_TRIPS) return fail('You have too many trips; cancel some first')

  const estimate = await estimateFor(tools, { origin: origin.name, destination: destination.name, hour, weather })
  if (typeof estimate === 'string') return fail(estimate)

  let trip: Trip
  try {
    trip = openTrip(estimate, offer)
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not open the trip')
  }
  const driver = trip.status === 'agreed' ? await matchDriver(tools, origin.lat, origin.lng) : null

  const saved = await tools.create('trips', {
    customerId: userId,
    origin: origin.name,
    destination: destination.name,
    originLat: origin.lat,
    originLng: origin.lng,
    hour,
    weather,
    driverName: driver?.name ?? '',
    etaMin: driver?.etaMin ?? 0,
    ...fieldsFor(trip),
  })
  if (!saved.success) return fail(`Could not save the trip: ${saved.error}`)
  return ok({ tripId: saved.data.recordId, status: trip.status })
}

function moveFrom(params: Fields): CustomerMove | null {
  switch (params.move) {
    case 'accept':
      return { type: 'accept' }
    case 'cancel':
      return { type: 'cancel' }
    case 'counter':
      return typeof params.cents === 'number' ? { type: 'counter', cents: params.cents } : null
    default:
      return null
  }
}

export const tripMove: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const tripId = str(params.tripId)
  const move = moveFrom(params)
  if (!tripId || !move) return fail('tripId and a valid move are required')

  const fields = await getFields(tools, 'trips', tripId)
  // Not yours reads as not found: actions bypass per-record permissions, so check here.
  if (!fields || fields.customerId !== userId) return fail('Trip not found')

  const estimate = await estimateFor(tools, {
    origin: String(fields.origin),
    destination: String(fields.destination),
    hour: Number(fields.hour),
    weather: String(fields.weather),
  })
  if (typeof estimate === 'string') return fail(estimate)

  let next: Trip
  try {
    next = customerMove(tripFrom(fields), estimate, move)
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'That move is not allowed')
  }

  const patch: Fields = fieldsFor(next)
  if (next.status === 'agreed') {
    const driver = await matchDriver(tools, Number(fields.originLat), Number(fields.originLng))
    patch.driverName = driver?.name ?? ''
    patch.etaMin = driver?.etaMin ?? 0
  }
  const upd = await tools.update('trips', tripId, patch)
  if (!upd.success) return fail(`Could not save: ${upd.error}`)
  return ok({ status: next.status })
}

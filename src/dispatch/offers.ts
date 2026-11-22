/**
 * Offer, reply and notification rules. PURE: the server actions call these and
 * add only I/O, so every decision here can be tested.
 */

import { TRUTH, ZONES, distanceKm, truthFareCents } from '../seed/generate'

/** City driving speed used for the pickup ETA. */
export const CITY_KMH = 25

/** Prefix for ids that belong to the simulated fleet or dispatcher. */
export const SIM_PREFIX = 'seed_'
export const SIM_DISPATCHER = 'simulated-dispatcher'

export const isSimulatedId = (id: string | undefined | null): boolean =>
  !!id && (id.startsWith(SIM_PREFIX) || id === SIM_DISPATCHER)

export function etaMinutes(km: number): number {
  return Math.max(2, Math.round((km / CITY_KMH) * 60))
}

export interface OfferInput {
  requestId: string
  origin: string
  destination: string
  fareCents: number
  driverUserId: string
  dispatcherId: string
  /** Distance from the driver to the pickup. */
  km: number
  reason: string
}

export type OfferData = {
  driverId: string
  requestId: string
  dispatcherId: string
  origin: string
  destination: string
  distanceKm: number
  fareCents: number
  etaMin: number
  reason: string
  status: 'pending'
  simulated: 0 | 1
}

export function buildOffer(i: OfferInput): OfferData {
  if (!Number.isInteger(i.fareCents) || i.fareCents <= 0) throw new Error('Offer needs a positive fare')
  if (!Number.isFinite(i.km) || i.km < 0) throw new Error('Offer needs a valid distance')
  const km = Math.round(i.km * 10) / 10
  return {
    driverId: i.driverUserId,
    requestId: i.requestId,
    dispatcherId: i.dispatcherId,
    origin: i.origin,
    destination: i.destination,
    distanceKm: km,
    fareCents: i.fareCents,
    etaMin: etaMinutes(km),
    reason: i.reason.slice(0, 240),
    status: 'pending',
    simulated: isSimulatedId(i.driverUserId) || isSimulatedId(i.dispatcherId) ? 1 : 0,
  }
}

/** Deterministic 0..1 from a string (FNV-1a), so a simulated driver is repeatable. */
function unit(s: string): number {
  let h = 0x811c9dc5
  for (let k = 0; k < s.length; k++) {
    h ^= s.charCodeAt(k)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return (h % 1000) / 1000
}

/** How a simulated driver answers: about three in four jobs are accepted. */
export function simulatedReply(driverUserId: string, offerId: string): 'accepted' | 'declined' {
  return unit(`${driverUserId}|${offerId}`) < 0.75 ? 'accepted' : 'declined'
}

export const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`

export function newOfferNotice(o: Pick<OfferData, 'origin' | 'destination' | 'fareCents' | 'distanceKm' | 'etaMin'>) {
  return {
    kind: 'offer',
    title: 'New job',
    body: `${o.origin} to ${o.destination} for ${usd(o.fareCents)}. Pickup ${o.distanceKm} km away, about ${o.etaMin} min.`,
  }
}

export function replyNotice(
  driverName: string,
  status: 'accepted' | 'declined',
  o: Pick<OfferData, 'origin' | 'destination'>,
) {
  return {
    kind: 'reply',
    title: status === 'accepted' ? 'Job accepted' : 'Job declined',
    body: `${driverName} ${status} ${o.origin} to ${o.destination}.`,
  }
}

export interface DemoJob {
  recordId: string
  data: OfferData
}

/** Three jobs from a simulated dispatcher, addressed to `userId`. Same input,
 *  same jobs, and fixed record ids so asking again resets rather than piles up. */
export function demoJobsFor(userId: string): DemoJob[] {
  const plan: ReadonlyArray<readonly [string, string, number, 'clear' | 'rain', number]> = [
    ['Downtown', 'Airport', 8, 'clear', 1.2],
    ['University', 'Midtown', 18, 'rain', 2.6],
    ['Harbor', 'Downtown', 13, 'clear', 0.7],
  ]
  return plan.map(([origin, destination, hour, weather, km], n) =>
    ({
      recordId: `demo-${userId}-${n + 1}`,
      data: buildOffer({
        requestId: `demo-req-${n + 1}`,
        origin,
        destination,
        fareCents: truthFareCents(origin, destination, hour, weather),
        driverUserId: userId,
        dispatcherId: SIM_DISPATCHER,
        km,
        reason: `${km.toFixed(1)} km from pickup, ${hour}:00, ${weather}`,
      }),
    }),
  )
}

// Re-exported so callers need only this module for zone lookups.
export { ZONES, TRUTH, distanceKm }

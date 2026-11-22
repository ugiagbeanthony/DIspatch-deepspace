/**
 * Driver matching: which free driver should take this request?
 *
 * PURE and deterministic. Closest wins; rating only breaks near-ties, and the
 * reason string is built from the same numbers that decided the order, so the
 * explanation can never disagree with the ranking.
 */

import { distanceKm } from '../seed/generate'

export interface DriverLite {
  recordId: string
  userId: string
  name: string
  lat: number
  lng: number
  rating: number
  status: string
}

export interface Ranked {
  driver: DriverLite
  km: number
  /** Lower is better. */
  score: number
  reason: string
}

/** 0.5 km of distance is traded for each star above 4.0. */
const KM_PER_STAR = 0.5

export function rankDrivers(origin: { lat: number; lng: number }, drivers: DriverLite[]): Ranked[] {
  return drivers
    .filter((d) => d.status === 'free')
    .map((driver) => {
      const km = distanceKm({ name: '', ...origin }, { name: '', lat: driver.lat, lng: driver.lng })
      return {
        driver,
        km,
        score: km - (driver.rating - 4) * KM_PER_STAR,
        reason: `${km.toFixed(1)} km from pickup, ${driver.rating.toFixed(1)} stars, free now`,
      }
    })
    .sort((a, b) => a.score - b.score || a.driver.userId.localeCompare(b.driver.userId))
}

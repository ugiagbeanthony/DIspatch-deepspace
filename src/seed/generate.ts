/**
 * Deterministic demo-data generator. PURE: no I/O, no clock, no randomness
 * except a seeded PRNG, so the same seed always yields the same fleet, the
 * same requests and the same 14 days of history.
 *
 * Everything here is SYNTHETIC and every row carries `synthetic: 1`.
 * Record ids are deterministic (`seed-driver-01`, ...) and `records.create`
 * upserts, so re-running the seed overwrites rather than duplicates.
 */

export const SEED = 20261121
export const HISTORY_DAYS = 14
export const HISTORY_PER_DAY = 10

export interface Zone {
  name: string
  lat: number
  lng: number
}

export const ZONES: readonly Zone[] = [
  { name: 'Downtown', lat: 40.7128, lng: -74.006 },
  { name: 'Airport', lat: 40.6413, lng: -73.7781 },
  { name: 'University', lat: 40.8075, lng: -73.9626 },
  { name: 'Harbor', lat: 40.7033, lng: -74.017 },
  { name: 'Midtown', lat: 40.7549, lng: -73.984 },
] as const

/**
 * The ground-truth pricing rules history is generated from. The pricing job
 * must not be handed these directly; it only ever sees the digest estimated
 * from the rows, which is the whole point.
 */
export const TRUTH = {
  baseCents: 350,
  centsPerKm: 175,
  rainMultiplier: 1.12,
  noise: 0.06,
  /** Multiplier by hour of day (0-23). Rush hours and late night cost more. */
  hourly: Array.from({ length: 24 }, (_, h) =>
    (h >= 7 && h <= 9) || (h >= 17 && h <= 19) ? 1.3 : h >= 22 || h <= 4 ? 1.2 : 1,
  ),
} as const

// -- seeded PRNG (mulberry32) -------------------------------------------------
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function distanceKm(a: Zone, b: Zone): number {
  const R = 6371
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

const zoneByName = (name: string): Zone => {
  const z = ZONES.find((x) => x.name === name)
  if (!z) throw new Error(`Unknown zone: ${name}`)
  return z
}

/** Noise-free fare for a trip, in cents, rounded to 5. */
export function truthFareCents(
  origin: string,
  destination: string,
  hour: number,
  weather: string,
): number {
  const km = distanceKm(zoneByName(origin), zoneByName(destination))
  const raw =
    (TRUTH.baseCents + TRUTH.centsPerKm * km) *
    TRUTH.hourly[hour] *
    (weather === 'rain' ? TRUTH.rainMultiplier : 1)
  return Math.round(raw / 5) * 5
}

// -- drivers ------------------------------------------------------------------
const DRIVER_NAMES = [
  'Amara Okafor', 'Ben Alvarez', 'Chen Wei', 'Dara Nwosu', 'Elena Petrova',
  'Farid Haddad', 'Grace Mensah', 'Hiro Tanaka', 'Imani Joseph', 'Jonas Berg',
  'Kofi Boateng', 'Lucia Romano', 'Mateo Silva', 'Nia Johnson', 'Omar Rahman',
  'Priya Nair', 'Quinn Murphy', 'Rosa Delgado', 'Sam Oyelaran', 'Tariq Aziz',
] as const

export interface DriverSeed {
  recordId: string
  data: {
    userId: string
    name: string
    lat: number
    lng: number
    rating: number
    status: 'free' | 'busy'
    synthetic: 1
  }
}

export function generateDrivers(seed = SEED): DriverSeed[] {
  const rnd = mulberry32(seed ^ 0xd41)
  return DRIVER_NAMES.map((name, i) => {
    const zone = ZONES[i % ZONES.length]
    const n = String(i + 1).padStart(2, '0')
    return {
      recordId: `seed-driver-${n}`,
      data: {
        userId: `seed_driver_${n}`,
        name,
        lat: round(zone.lat + (rnd() - 0.5) * 0.03, 5),
        lng: round(zone.lng + (rnd() - 0.5) * 0.03, 5),
        rating: round(4.2 + rnd() * 0.8, 1),
        status: rnd() < 0.7 ? 'free' : 'busy',
        synthetic: 1,
      },
    }
  })
}

// -- requests -----------------------------------------------------------------
export interface RequestSeed {
  recordId: string
  data: {
    origin: string
    destination: string
    originLat: number
    originLng: number
    hour: number
    /** What the customer offers to pay (below the fair price, as callers do). */
    proposedCents: number
    weather: 'clear' | 'rain'
    status: 'open'
    synthetic: 1
  }
}

/**
 * Fixed on purpose: six hand-picked requests, two of them in the rain, so the
 * demo always has a rain case to price. Not random.
 */
const REQUEST_PLAN: ReadonlyArray<readonly [string, string, number, 'clear' | 'rain', number]> = [
  // origin, destination, hour, weather, share of the fair fare the customer offers
  ['Downtown', 'Airport', 8, 'clear', 0.82],
  ['University', 'Midtown', 18, 'rain', 0.9],
  ['Harbor', 'Downtown', 13, 'clear', 0.78],
  ['Midtown', 'Airport', 23, 'clear', 0.85],
  ['Airport', 'University', 9, 'rain', 0.88],
  ['Downtown', 'Harbor', 15, 'clear', 0.8],
]

export function generateRequests(): RequestSeed[] {
  return REQUEST_PLAN.map(([origin, destination, hour, weather, share], i) => {
    const z = zoneByName(origin)
    return {
      recordId: `seed-req-${i + 1}`,
      data: {
        origin,
        destination,
        originLat: z.lat,
        originLng: z.lng,
        hour,
        proposedCents: Math.round((truthFareCents(origin, destination, hour, weather) * share) / 5) * 5,
        weather,
        status: 'open',
        synthetic: 1,
      },
    }
  })
}

/**
 * The six demo requests for ONE dispatcher. Record ids include the user id, so
 * every dispatcher gets their own copies (and `createdBy` is them), instead of
 * everyone sharing one set.
 */
export function demoRequestsFor(userId: string): RequestSeed[] {
  return generateRequests().map((r, i) => ({ ...r, recordId: `req-${userId}-${i + 1}` }))
}

// -- history (ground truth for pricing) ----------------------------------------
export interface HistorySeed {
  recordId: string
  data: {
    origin: string
    destination: string
    hour: number
    weather: 'clear' | 'rain'
    day: number
    clearedCents: number
    synthetic: 1
  }
}

/** Hours rides actually happen, weighted toward daytime and the two rushes. */
const HOUR_POOL = [6, 7, 8, 8, 9, 10, 12, 13, 15, 16, 17, 17, 18, 19, 20, 21, 22, 23, 1]

export function generateHistory(
  seed = SEED,
  days = HISTORY_DAYS,
  perDay = HISTORY_PER_DAY,
): HistorySeed[] {
  const rnd = mulberry32(seed ^ 0x415)
  const rows: HistorySeed[] = []
  for (let day = 0; day < days; day++) {
    // Rain comes in whole days, like weather does: about 3 days in 10.
    const rainyDay = rnd() < 0.3
    for (let k = 0; k < perDay; k++) {
      const o = Math.floor(rnd() * ZONES.length)
      let d = Math.floor(rnd() * (ZONES.length - 1))
      if (d >= o) d++
      const hour = HOUR_POOL[Math.floor(rnd() * HOUR_POOL.length)]
      const weather = rainyDay ? 'rain' : 'clear'
      const base = truthFareCents(ZONES[o].name, ZONES[d].name, hour, weather)
      const noisy = base * (1 + (rnd() * 2 - 1) * TRUTH.noise)
      rows.push({
        recordId: `seed-hist-${String(day).padStart(2, '0')}-${String(k).padStart(2, '0')}`,
        data: {
          origin: ZONES[o].name,
          destination: ZONES[d].name,
          hour,
          weather,
          day,
          clearedCents: Math.round(noisy / 5) * 5,
          synthetic: 1,
        },
      })
    }
  }
  return rows
}

// -- digest: what the pricing job learns from history --------------------------
export interface Digest {
  sampleSize: number
  /** Median cleared fare by "Origin>Destination". */
  pairMedianCents: Record<string, number>
  /** Typical fare vs its pair median, by hour (1 where no data). */
  hourlyMultiplier: number[]
  /** Rain fare vs clear fare, after normalising by pair. */
  rainMultiplier: number
}

export function median(xs: number[]): number {
  if (xs.length === 0) return NaN
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

type HistoryLike = {
  origin: string
  destination: string
  hour: number
  weather: string
  clearedCents: number
}

export function buildDigest(history: ReadonlyArray<HistoryLike>): Digest {
  const key = (r: { origin: string; destination: string }) => `${r.origin}>${r.destination}`
  const byPair = new Map<string, number[]>()
  for (const r of history) {
    const k = key(r)
    byPair.set(k, [...(byPair.get(k) ?? []), r.clearedCents])
  }
  const pairMedianCents: Record<string, number> = {}
  for (const [k, v] of byPair) pairMedianCents[k] = median(v)

  const ratio = (r: HistoryLike) => r.clearedCents / pairMedianCents[key(r)]
  const hourlyMultiplier = Array.from({ length: 24 }, (_, h) => {
    const rs = history.filter((r) => r.hour === h && r.weather === 'clear').map(ratio)
    return rs.length ? round(median(rs), 3) : 1
  })
  const rain = history.filter((r) => r.weather === 'rain').map(ratio)
  const clear = history.filter((r) => r.weather === 'clear').map(ratio)
  const rainMultiplier = rain.length && clear.length ? round(median(rain) / median(clear), 3) : 1

  return { sampleSize: history.length, pairMedianCents, hourlyMultiplier, rainMultiplier }
}

function round(n: number, places: number): number {
  const f = 10 ** places
  return Math.round(n * f) / f
}

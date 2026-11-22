import { describe, expect, it } from 'vitest'
import {
  HISTORY_DAYS,
  HISTORY_PER_DAY,
  ZONES,
  buildDigest,
  generateDrivers,
  generateHistory,
  generateRequests,
  truthFareCents,
} from './generate'

describe('seed generator', () => {
  it('produces the planned counts', () => {
    expect(generateDrivers()).toHaveLength(20)
    expect(generateRequests()).toHaveLength(6)
    expect(generateHistory()).toHaveLength(HISTORY_DAYS * HISTORY_PER_DAY)
  })

  it('is deterministic: same seed, identical output', () => {
    expect(JSON.stringify(generateHistory())).toBe(JSON.stringify(generateHistory()))
    expect(JSON.stringify(generateDrivers())).toBe(JSON.stringify(generateDrivers()))
    expect(JSON.stringify(generateHistory(1))).not.toBe(JSON.stringify(generateHistory(2)))
  })

  it('has no duplicate record ids, so re-seeding upserts instead of duplicating', () => {
    for (const rows of [generateDrivers(), generateRequests(), generateHistory()]) {
      const ids = rows.map((r) => r.recordId)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('flags every row synthetic', () => {
    for (const r of [...generateDrivers(), ...generateRequests(), ...generateHistory()]) {
      expect(r.data.synthetic).toBe(1)
    }
  })

  it('keeps driver ids distinct and requests between real, different zones', () => {
    const userIds = generateDrivers().map((d) => d.data.userId)
    expect(new Set(userIds).size).toBe(20)
    const names = new Set(ZONES.map((z) => z.name))
    for (const r of generateRequests()) {
      expect(names.has(r.data.origin)).toBe(true)
      expect(names.has(r.data.destination)).toBe(true)
      expect(r.data.origin).not.toBe(r.data.destination)
    }
    expect(generateRequests().filter((r) => r.data.weather === 'rain')).toHaveLength(2)
  })

  it('generates plausible fares', () => {
    for (const h of generateHistory()) {
      expect(h.data.clearedCents).toBeGreaterThan(400)
      expect(h.data.clearedCents).toBeLessThan(8000)
    }
  })

  it('digest recovers the rain effect from the data (ground truth is 1.12)', () => {
    const d = buildDigest(generateHistory().map((r) => r.data))
    expect(d.sampleSize).toBe(HISTORY_DAYS * HISTORY_PER_DAY)
    expect(d.rainMultiplier).toBeGreaterThan(1.03)
    expect(d.rainMultiplier).toBeLessThan(1.25)
    expect(Object.keys(d.pairMedianCents).length).toBeGreaterThan(10)
  })

  it('gives every request a customer price a little under the fair fare', () => {
    for (const r of generateRequests()) {
      const fair = truthFareCents(r.data.origin, r.data.destination, r.data.hour, r.data.weather)
      expect(r.data.proposedCents).toBeGreaterThan(0)
      expect(r.data.proposedCents).toBeLessThan(fair)
      expect(r.data.proposedCents).toBeGreaterThan(fair * 0.7)
    }
  })
})

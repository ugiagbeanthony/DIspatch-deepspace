import { describe, expect, it } from 'vitest'
import { generateDrivers, generateRequests } from '../seed/generate'
import { rankDrivers, type DriverLite } from './rank'

const fleet: DriverLite[] = generateDrivers().map((d) => ({ recordId: d.recordId, ...d.data }))
const origin = { lat: 40.7128, lng: -74.006 } // Downtown

describe('rankDrivers', () => {
  it('ranks the nearest free driver first', () => {
    const ranked = rankDrivers(origin, fleet)
    expect(ranked.length).toBeGreaterThan(0)
    const nearestFree = Math.min(...ranked.map((r) => r.km))
    // Rating can only move the winner a short way, never past a much-closer driver.
    expect(ranked[0].km - nearestFree).toBeLessThan(0.5 * 1)
  })

  it('never offers a busy driver', () => {
    const ranked = rankDrivers(origin, fleet)
    expect(ranked.every((r) => r.driver.status === 'free')).toBe(true)
    expect(ranked.length).toBe(fleet.filter((d) => d.status === 'free').length)
  })

  it('re-ranks when the driver moves: a driver who moves next to the pickup wins', () => {
    const before = rankDrivers(origin, fleet)[0].driver.userId
    const target = fleet.find((d) => d.status === 'free' && d.userId !== before)!
    const moved = fleet.map((d) => (d.userId === target.userId ? { ...d, lat: origin.lat, lng: origin.lng } : d))
    expect(rankDrivers(origin, moved)[0].driver.userId).toBe(target.userId)
  })

  it('breaks a near-tie by rating', () => {
    const a: DriverLite = { recordId: 'a', userId: 'a', name: 'A', lat: 40.7128, lng: -74.006, rating: 4.2, status: 'free' }
    const b: DriverLite = { ...a, recordId: 'b', userId: 'b', name: 'B', rating: 4.9 }
    expect(rankDrivers(origin, [a, b])[0].driver.userId).toBe('b')
  })

  it('gives a reason that quotes the real distance and rating', () => {
    const top = rankDrivers(origin, fleet)[0]
    expect(top.reason).toContain(top.km.toFixed(1))
    expect(top.reason).toContain(top.driver.rating.toFixed(1))
  })

  it('is deterministic and works for every seeded request', () => {
    for (const r of generateRequests()) {
      const o = { lat: r.data.originLat, lng: r.data.originLng }
      expect(rankDrivers(o, fleet).map((x) => x.driver.userId)).toEqual(
        rankDrivers(o, fleet).map((x) => x.driver.userId),
      )
      expect(rankDrivers(o, fleet).length).toBeGreaterThan(0)
    }
  })
})

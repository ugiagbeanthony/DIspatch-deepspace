import { describe, expect, it } from 'vitest'
import {
  SIM_DISPATCHER,
  buildOffer,
  demoJobsFor,
  etaMinutes,
  isSimulatedId,
  newOfferNotice,
  replyNotice,
  simulatedReply,
} from './offers'

const base = {
  requestId: 'seed-req-1',
  origin: 'Downtown',
  destination: 'Airport',
  fareCents: 3150,
  driverUserId: 'user_real_driver',
  dispatcherId: 'user_real_dispatcher',
  km: 2.04,
  reason: '2.0 km from pickup',
}

describe('buildOffer', () => {
  it('copies everything a driver needs onto the offer', () => {
    const o = buildOffer(base)
    expect(o).toMatchObject({
      driverId: 'user_real_driver',
      origin: 'Downtown',
      destination: 'Airport',
      fareCents: 3150,
      distanceKm: 2,
      status: 'pending',
      simulated: 0,
    })
    expect(o.etaMin).toBe(etaMinutes(2))
  })

  it('marks an offer simulated when either side is simulated', () => {
    expect(buildOffer({ ...base, driverUserId: 'seed_driver_03' }).simulated).toBe(1)
    expect(buildOffer({ ...base, dispatcherId: SIM_DISPATCHER }).simulated).toBe(1)
  })

  it('refuses a missing price or a bad distance', () => {
    expect(() => buildOffer({ ...base, fareCents: 0 })).toThrow()
    expect(() => buildOffer({ ...base, fareCents: 12.5 })).toThrow()
    expect(() => buildOffer({ ...base, km: -1 })).toThrow()
  })
})

describe('etaMinutes', () => {
  it('scales with distance and never says less than 2 minutes', () => {
    expect(etaMinutes(0)).toBe(2)
    expect(etaMinutes(5)).toBe(12)
    expect(etaMinutes(10)).toBeGreaterThan(etaMinutes(5))
  })
})

describe('simulatedReply', () => {
  it('is deterministic for the same driver and offer', () => {
    expect(simulatedReply('seed_driver_01', 'o1')).toBe(simulatedReply('seed_driver_01', 'o1'))
  })

  it('accepts most jobs but not all, across a fleet', () => {
    const replies = Array.from({ length: 200 }, (_, i) => simulatedReply(`seed_driver_${i}`, `offer-${i}`))
    const accepted = replies.filter((r) => r === 'accepted').length
    expect(accepted).toBeGreaterThan(110)
    expect(accepted).toBeLessThan(190)
  })
})

describe('notifications', () => {
  it('tells a driver about a new job with price, distance and time', () => {
    const n = newOfferNotice(buildOffer(base))
    expect(n.title).toBe('New job')
    expect(n.body).toContain('$31.50')
    expect(n.body).toContain('Downtown to Airport')
  })

  it('tells a dispatcher how the driver answered', () => {
    const o = buildOffer(base)
    expect(replyNotice('Amara', 'accepted', o).title).toBe('Job accepted')
    expect(replyNotice('Amara', 'declined', o).body).toBe('Amara declined Downtown to Airport.')
  })
})

describe('demo jobs for the driver screen', () => {
  const jobs = demoJobsFor('user_abc')

  it('are three jobs addressed to the caller from a simulated dispatcher', () => {
    expect(jobs).toHaveLength(3)
    for (const j of jobs) {
      expect(j.data.driverId).toBe('user_abc')
      expect(j.data.dispatcherId).toBe(SIM_DISPATCHER)
      expect(j.data.simulated).toBe(1)
      expect(j.data.status).toBe('pending')
      expect(j.data.fareCents).toBeGreaterThan(0)
    }
  })

  it('use fixed ids per user so repeating overwrites instead of duplicating', () => {
    expect(demoJobsFor('user_abc').map((j) => j.recordId)).toEqual(jobs.map((j) => j.recordId))
    expect(new Set(jobs.map((j) => j.recordId)).size).toBe(3)
    expect(demoJobsFor('user_xyz')[0].recordId).not.toBe(jobs[0].recordId)
  })
})

describe('isSimulatedId', () => {
  it('flags seeded fleet and the simulated dispatcher only', () => {
    expect(isSimulatedId('seed_driver_01')).toBe(true)
    expect(isSimulatedId(SIM_DISPATCHER)).toBe(true)
    expect(isSimulatedId('user_real')).toBe(false)
    expect(isSimulatedId(undefined)).toBe(false)
  })
})

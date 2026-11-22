import { describe, expect, it } from 'vitest'
import {
  SIM_DISPATCHER,
  SIM_MS_PER_MIN,
  activeJob,
  jobDurationMs,
  jobPhase,
  remainingMs,
  sendBlockReason,
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

describe('one job at a time, on the demo clock', () => {
  const T0 = 1_000_000
  const job = (o: { status: string; etaMin: number; acceptedAt?: number; id?: string }) => o

  it('compresses trip time: one minute of ETA is SIM_MS_PER_MIN of real time', () => {
    expect(jobDurationMs(6)).toBe(6 * SIM_MS_PER_MIN)
  })

  it('walks pending -> in-progress -> done as the clock advances', () => {
    expect(jobPhase(job({ status: 'pending', etaMin: 3 }), T0)).toBe('pending')
    const accepted = job({ status: 'accepted', etaMin: 3, acceptedAt: T0 })
    expect(jobPhase(accepted, T0)).toBe('in-progress')
    expect(jobPhase(accepted, T0 + jobDurationMs(3) - 1)).toBe('in-progress')
    expect(jobPhase(accepted, T0 + jobDurationMs(3))).toBe('done')
  })

  it('a declined job is declined, never in progress', () => {
    expect(jobPhase(job({ status: 'declined', etaMin: 3, acceptedAt: T0 }), T0)).toBe('declined')
  })

  it('reports time left, then zero once done', () => {
    const a = job({ status: 'accepted', etaMin: 2, acceptedAt: T0 })
    expect(remainingMs(a, T0 + 1000)).toBe(jobDurationMs(2) - 1000)
    expect(remainingMs(a, T0 + jobDurationMs(2) + 5)).toBe(0)
    expect(remainingMs(job({ status: 'pending', etaMin: 2 }), T0)).toBe(0)
  })

  it('finds the job a driver is mid-way through, and none once it is finished', () => {
    const a = job({ id: 'a', status: 'accepted', etaMin: 3, acceptedAt: T0 })
    const b = job({ id: 'b', status: 'pending', etaMin: 2 })
    expect(activeJob([b, a], T0 + 1)).toBe(a)
    expect(activeJob([b, a], T0 + jobDurationMs(3))).toBeNull()
    expect(activeJob([b], T0)).toBeNull()
  })

  it('an accepted job with no start time is treated as done, so it cannot lock a driver out', () => {
    const legacy = job({ id: 'old', status: 'accepted', etaMin: 3 })
    expect(jobPhase(legacy, T0)).toBe('done')
    expect(activeJob([legacy], T0)).toBeNull()
  })

  it('a fresh offer starts with no acceptance time', () => {
    expect(buildOffer(base).acceptedAt).toBe(0)
  })
})

describe('sendBlockReason', () => {
  it('allows sending when nothing is accepted: none sent, pending, or declined', () => {
    expect(sendBlockReason([])).toBeNull()
    expect(sendBlockReason([{ status: 'pending' }])).toBeNull()
    expect(sendBlockReason([{ status: 'declined' }, { status: 'pending' }])).toBeNull()
  })

  it('locks the request as soon as any driver has accepted, even if others declined', () => {
    expect(sendBlockReason([{ status: 'accepted' }])).toMatch(/accepted/)
    expect(sendBlockReason([{ status: 'declined' }, { status: 'accepted' }])).not.toBeNull()
  })
})

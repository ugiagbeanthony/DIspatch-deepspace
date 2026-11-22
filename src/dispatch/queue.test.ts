import { describe, expect, it } from 'vitest'
import { jobDurationMs } from './offers'
import { bucketOf, isFinal, orderQueue } from './queue'

const T0 = 1_000_000
const done = { status: 'accepted', etaMin: 3, acceptedAt: T0 - jobDurationMs(3) - 1 }
const onTheWay = { status: 'accepted', etaMin: 3, acceptedAt: T0 }
const waiting = { status: 'pending', etaMin: 3 }

describe('final states', () => {
  it('rejected and cancelled are final', () => {
    expect(isFinal('rejected', [], T0)).toBe(true)
    expect(isFinal('cancelled', [], T0)).toBe(true)
  })

  it('a request is done only once the accepted job has finished', () => {
    expect(isFinal('accepted', [done], T0)).toBe(true)
    expect(isFinal('accepted', [onTheWay], T0 + 1)).toBe(false)
  })

  it('open, priced, negotiating, agreed, offered and declined are not final', () => {
    for (const s of ['open', 'priced', 'negotiating', 'agreed', 'offered', 'declined']) {
      expect(isFinal(s, [], T0), s).toBe(false)
    }
  })
})

describe('buckets', () => {
  it('splits work into unattended, in-progress and final', () => {
    expect(bucketOf('open', [], T0)).toBe('unattended')
    expect(bucketOf('negotiating', [], T0)).toBe('unattended')
    expect(bucketOf('agreed', [], T0)).toBe('unattended')
    expect(bucketOf('declined', [{ status: 'declined', etaMin: 3 }], T0)).toBe('unattended')
    expect(bucketOf('offered', [waiting], T0)).toBe('in-progress')
    expect(bucketOf('accepted', [onTheWay], T0 + 1)).toBe('in-progress')
    expect(bucketOf('accepted', [done], T0)).toBe('final')
    expect(bucketOf('rejected', [], T0)).toBe('final')
  })
})

describe('queue order', () => {
  interface Req {
    id: string
    status: string
    offers: Array<{ status: string; etaMin: number; acceptedAt?: number }>
    at: number
  }
  const get = (r: Req) => ({ status: r.status, offers: r.offers, createdMs: r.at })
  const ids = (xs: Array<{ item: Req }>) => xs.map((x) => x.item.id)

  const reqs: Req[] = [
    { id: 'new-open', status: 'open', offers: [], at: 50 },
    { id: 'old-open', status: 'open', offers: [], at: 10 },
    { id: 'mid-priced', status: 'priced', offers: [], at: 30 },
    { id: 'with-driver', status: 'offered', offers: [waiting], at: 5 },
    { id: 'old-rejected', status: 'rejected', offers: [], at: 1 },
    { id: 'new-rejected', status: 'rejected', offers: [], at: 90 },
  ]

  it('puts the request that has waited longest first', () => {
    const q = orderQueue(reqs, get, T0)
    expect(ids(q).slice(0, 3)).toEqual(['old-open', 'mid-priced', 'new-open'])
  })

  it('then in-progress, then finished with the newest finished first', () => {
    const q = orderQueue(reqs, get, T0)
    expect(ids(q)).toEqual(['old-open', 'mid-priced', 'new-open', 'with-driver', 'new-rejected', 'old-rejected'])
  })

  it('reports each request\u2019s bucket and keeps ties in their original order', () => {
    const tied: Req[] = [
      { id: 'a', status: 'open', offers: [], at: 1 },
      { id: 'b', status: 'open', offers: [], at: 1 },
    ]
    const q = orderQueue(tied, get, T0)
    expect(ids(q)).toEqual(['a', 'b'])
    expect(q.every((x) => x.bucket === 'unattended')).toBe(true)
    expect(orderQueue([], get, T0)).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import { buildDigest, generateHistory } from '../seed/generate'
import {
  assertReconciles,
  baseMedian,
  boundsFor,
  estimateCents,
  fallbackFactors,
  parseModelOutput,
  priceRequest,
  sumFactors,
  validate,
} from './reconcile'

const digest = buildDigest(generateHistory().map((r) => r.data))
const req = { origin: 'Downtown', destination: 'Airport', hour: 8, weather: 'rain' }
const base = Math.round(baseMedian(digest, req.origin, req.destination))
const bounds = boundsFor(base)

/** A well-formed, honest answer built from the digest. */
function honest(): string {
  const factors = [
    { name: 'Route base', cents: base, why: 'Median of past clears.' },
    { name: 'Rush hour', cents: 400, why: 'Morning peak.' },
    { name: 'Rain', cents: 300, why: 'Rain days cleared higher.' },
  ]
  return JSON.stringify({ factors, claimedTotalCents: sumFactors(factors) })
}

/** Same rows, but the model states the WRONG total. */
function badArithmetic(off = 250): string {
  const o = JSON.parse(honest())
  o.claimedTotalCents += off
  return JSON.stringify(o)
}

const sequence = (...answers: string[]) => {
  let i = 0
  const calls: string[] = []
  return { calls, callModel: async (p: string) => (calls.push(p), answers[Math.min(i++, answers.length - 1)]) }
}

describe('priceRequest: the model never produces the total', () => {
  it('accepts an honest answer and uses the SUM of factors as the total', async () => {
    const { callModel } = sequence(honest())
    const r = await priceRequest({ digest, request: req, callModel })
    expect(r.source).toBe('model')
    expect(r.rejections).toHaveLength(0)
    expect(r.totalCents).toBe(sumFactors(r.factors))
    expect(r.totalCents).toBe(base + 700)
  })

  it('rejects wrong model arithmetic, retries once, and records the rejection', async () => {
    const { callModel, calls } = sequence(badArithmetic(), honest())
    const seen: string[] = []
    const r = await priceRequest({ digest, request: req, callModel, onReject: (x) => seen.push(x.reason) })
    expect(r.source).toBe('model')
    expect(r.rejections).toHaveLength(1)
    expect(r.rejections[0].reason).toMatch(/claimed total .* does not equal factor sum/)
    expect(seen).toHaveLength(1)
    expect(calls).toHaveLength(2)
    expect(calls[1]).toMatch(/previous answer was rejected/)
    expect(r.totalCents).toBe(sumFactors(r.factors))
  })

  it('falls back to the digest price after two bad answers, and says so', async () => {
    const { callModel, calls } = sequence(badArithmetic(), badArithmetic(999))
    const r = await priceRequest({ digest, request: req, callModel })
    expect(calls).toHaveLength(2)
    expect(r.source).toBe('fallback')
    expect(r.rejections).toHaveLength(2)
    expect(r.totalCents).toBe(sumFactors(r.factors))
    expect(r.totalCents).toBe(sumFactors(fallbackFactors(digest, req)))
  })

  it('never calls the model a third time', async () => {
    const { callModel, calls } = sequence('garbage', 'garbage', honest())
    const r = await priceRequest({ digest, request: req, callModel })
    expect(calls).toHaveLength(2)
    expect(r.source).toBe('fallback')
  })

  it('treats a throwing model as a rejection, not a crash', async () => {
    let n = 0
    const r = await priceRequest({
      digest,
      request: req,
      callModel: async () => {
        if (n++ === 0) throw new Error('upstream 500')
        return honest()
      },
    })
    expect(r.source).toBe('model')
    expect(r.rejections[0].reason).toMatch(/model call failed: upstream 500/)
  })
})

describe('validate: every way a model can be wrong', () => {
  const ok = (factors: unknown, claimed: unknown) => validate({ factors, claimedTotalCents: claimed }, bounds)
  const f = (cents: number) => ({ name: 'x', cents, why: 'because' })

  it('accepts a correct answer', () => {
    expect(ok([f(base), f(100)], base + 100).ok).toBe(true)
  })

  it('rejects: not an array, too few, too many rows', () => {
    expect(ok('nope', 1).ok).toBe(false)
    expect(ok([f(base)], base).ok).toBe(false)
    expect(ok(Array.from({ length: 9 }, () => f(10)), 90).ok).toBe(false)
  })

  it('rejects decimal, NaN, string and absurd cents', () => {
    expect(ok([f(base), f(10.5)], base + 10.5).ok).toBe(false)
    expect(ok([f(base), f(Number.NaN)], Number.NaN).ok).toBe(false)
    expect(ok([f(base), { name: 'x', cents: '100', why: 'y' }], base + 100).ok).toBe(false)
    expect(ok([f(base), f(10_000_000)], base + 10_000_000).ok).toBe(false)
  })

  it('rejects missing name or explanation', () => {
    expect(ok([f(base), { name: '', cents: 1, why: 'y' }], base + 1).ok).toBe(false)
    expect(ok([f(base), { name: 'x', cents: 1, why: '' }], base + 1).ok).toBe(false)
  })

  it('rejects a missing or non-numeric claimed total', () => {
    expect(ok([f(base), f(100)], undefined).ok).toBe(false)
    expect(ok([f(base), f(100)], '1000').ok).toBe(false)
  })

  it('rejects a total outside the floor and ceiling (no silent clamp)', () => {
    const low = ok([f(100), f(50)], 150)
    expect(low.ok).toBe(false)
    const high = ok([f(base), f(bounds.ceiling)], base + bounds.ceiling)
    expect(high.ok).toBe(false)
  })

  it('negative adjustments are allowed when the total stays in range', () => {
    expect(ok([f(base), f(-100)], base - 100).ok).toBe(true)
  })
})

describe('parseModelOutput', () => {
  it('reads JSON wrapped in fences and chatter', () => {
    const p = parseModelOutput('Sure!\n```json\n{"factors":[1],"claimedTotalCents":5}\n```')
    expect('error' in p).toBe(false)
  })
  it('reports unparseable text instead of throwing', () => {
    expect(parseModelOutput('no braces here')).toHaveProperty('error')
    expect(parseModelOutput('{ not json }')).toHaveProperty('error')
  })
})

describe('assertReconciles', () => {
  it('passes when rows add up and throws when they do not', () => {
    expect(() => assertReconciles([{ cents: 100 }, { cents: 50 }], 150)).not.toThrow()
    expect(() => assertReconciles([{ cents: 100 }, { cents: 50 }], 151)).toThrow(/does not reconcile/)
  })
})

describe('fallback', () => {
  it('always reconciles and stays inside the bounds for every request in the demo', () => {
    for (const weather of ['clear', 'rain']) {
      for (let hour = 0; hour < 24; hour++) {
        const fs = fallbackFactors(digest, { origin: 'Harbor', destination: 'Midtown', hour, weather })
        const total = sumFactors(fs)
        const b = boundsFor(baseMedian(digest, 'Harbor', 'Midtown'))
        expect(total).toBeGreaterThanOrEqual(b.floor)
        expect(total).toBeLessThanOrEqual(b.ceiling)
      }
    }
  })
})

describe('estimateCents', () => {
  it('is the history-based price, inside the allowed range', () => {
    const e = estimateCents(digest, req)
    expect(e).toBe(sumFactors(fallbackFactors(digest, req)))
    expect(e).toBeGreaterThanOrEqual(bounds.floor)
    expect(e).toBeLessThanOrEqual(bounds.ceiling)
  })
})

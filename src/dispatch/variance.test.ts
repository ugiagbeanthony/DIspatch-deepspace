import { describe, expect, it } from 'vitest'
import { summarize, validateAdjustment, type FareRow } from './variance'

const row = (o: Partial<FareRow> & Pick<FareRow, 'suggestedCents' | 'finalCents'>): FareRow => ({
  requestId: 'r',
  label: 'A to B',
  weather: 'clear',
  overridden: o.suggestedCents !== o.finalCents,
  ...o,
})

describe('summarize', () => {
  it('computes each delta from its own row', () => {
    const s = summarize([
      row({ requestId: 'a', suggestedCents: 2000, finalCents: 2200 }),
      row({ requestId: 'b', suggestedCents: 3000, finalCents: 2700 }),
    ])
    expect(s.rows[0]).toMatchObject({ requestId: 'a', deltaCents: 200, deltaPct: 10 })
    expect(s.rows[1]).toMatchObject({ requestId: 'b', deltaCents: -300, deltaPct: -10 })
  })

  it('reports average size and direction separately', () => {
    const s = summarize([
      row({ suggestedCents: 2000, finalCents: 2200 }),
      row({ suggestedCents: 3000, finalCents: 2700 }),
    ])
    expect(s.meanAbsDeltaPct).toBeCloseTo(10)
    expect(s.meanDeltaPct).toBeCloseTo(0)
    expect(s.overriddenCount).toBe(2)
  })

  it('counts untouched fares as zero variance, not as overrides', () => {
    const s = summarize([row({ suggestedCents: 2000, finalCents: 2000 })])
    expect(s.overriddenCount).toBe(0)
    expect(s.rows[0].deltaPct).toBe(0)
  })

  it('measures model bias against the hidden reference, split by weather', () => {
    const s = summarize([
      row({ suggestedCents: 2200, finalCents: 2200, referenceCents: 2000, weather: 'rain' }),
      row({ suggestedCents: 2000, finalCents: 2000, referenceCents: 2000, weather: 'clear' }),
    ])
    expect(s.modelBias.byWeather.rain.meanPct).toBeCloseTo(10)
    expect(s.modelBias.byWeather.clear.meanPct).toBeCloseTo(0)
    expect(s.modelBias.all?.count).toBe(2)
  })

  it('handles no fares and no reference without NaN', () => {
    const empty = summarize([])
    expect(empty.meanAbsDeltaPct).toBe(0)
    expect(empty.modelBias.all).toBeNull()
    const noRef = summarize([row({ suggestedCents: 2000, finalCents: 2000 })])
    expect(noRef.modelBias.all).toBeNull()
  })
})

describe('three-way comparison: customer proposed vs AI vs agreed', () => {
  it('measures the AI and the agreed price against what the customer proposed', () => {
    const s = summarize([
      row({ suggestedCents: 2400, finalCents: 2200, proposedCents: 2000 }),
      row({ suggestedCents: 3000, finalCents: 2700, proposedCents: 2500 }),
    ])
    expect(s.rows[0].aiVsProposedPct).toBeCloseTo(20)
    expect(s.rows[0].finalVsProposedPct).toBeCloseTo(10)
    expect(s.meanAiVsProposedPct).toBeCloseTo(20)
    expect(s.meanFinalVsProposedPct).toBeCloseTo(9)
  })

  it('leaves the comparison empty, not NaN, when no customer price exists', () => {
    const s = summarize([row({ suggestedCents: 2000, finalCents: 2000 })])
    expect(s.rows[0].aiVsProposedPct).toBeUndefined()
    expect(s.meanAiVsProposedPct).toBeNull()
    expect(s.meanFinalVsProposedPct).toBeNull()
  })
})

describe('validateAdjustment', () => {
  const ok = (r: ReturnType<typeof validateAdjustment>) => ('value' in r ? r.value : null)

  it('accepts a changed price with a reason', () => {
    expect(ok(validateAdjustment(2000, '25.50', 'Long wait at pickup'))).toEqual({
      finalCents: 2550,
      overridden: true,
      overrideReason: 'Long wait at pickup',
    })
  })

  it('requires a reason when the price changes', () => {
    expect(validateAdjustment(2000, '25', '  ')).toEqual({ error: 'Say why you changed the price' })
  })

  it('treats the suggested price as no override and needs no reason', () => {
    expect(ok(validateAdjustment(2000, '$20.00', ''))).toEqual({
      finalCents: 2000,
      overridden: false,
      overrideReason: '',
    })
  })

  it('rejects junk, zero, negatives, extra decimals and absurd prices', () => {
    for (const bad of ['', 'abc', '0', '-5', '12.345', '1e3', '12,50']) {
      expect('error' in validateAdjustment(2000, bad, 'x')).toBe(true)
    }
    expect('error' in validateAdjustment(2000, '500', 'x')).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import {
  MAX_ROUNDS,
  customerMove,
  dispatcherFloorCents,
  isClosed,
  openTrip,
  openingQuoteCents,
  type Trip,
} from './trip'

const ESTIMATE = 2000 // the simulated dispatcher's own price estimate: $20.00
const FLOOR = dispatcherFloorCents(ESTIMATE) // hidden: $18.00
const counter = (t: Trip, cents: number) => customerMove(t, ESTIMATE, { type: 'counter', cents })

describe('opening a trip', () => {
  it('has a hidden floor at 90% of the estimate and opens a little above it', () => {
    expect(FLOOR).toBe(1800)
    expect(openingQuoteCents(ESTIMATE)).toBe(2100)
  })

  it('accepts an offer at or above the floor straight away, at the offered price', () => {
    for (const offer of [FLOOR, 1900, 2500]) {
      const t = openTrip(ESTIMATE, offer)
      expect(t.status).toBe('agreed')
      expect(t.agreedCents).toBe(offer)
    }
  })

  it('quotes when the offer is below the floor', () => {
    const t = openTrip(ESTIMATE, 1000)
    expect(t.status).toBe('quoted')
    expect(t.quoteCents).toBe(openingQuoteCents(ESTIMATE))
    expect(t.quoteCents).toBeGreaterThanOrEqual(FLOOR)
  })

  it('refuses nonsense input', () => {
    expect(() => openTrip(ESTIMATE, 0)).toThrow()
    expect(() => openTrip(ESTIMATE, 12.5)).toThrow()
    expect(() => openTrip(0, 1000)).toThrow()
  })
})

describe('customer moves', () => {
  it('accepting takes the current quote', () => {
    const t = customerMove(openTrip(ESTIMATE, 1000), ESTIMATE, { type: 'accept' })
    expect(t).toMatchObject({ status: 'agreed', agreedCents: 2100 })
  })

  it('cancelling ends the trip', () => {
    expect(customerMove(openTrip(ESTIMATE, 1000), ESTIMATE, { type: 'cancel' }).status).toBe('cancelled')
  })

  it('a counter at or above the floor is accepted at that price', () => {
    const t = counter(openTrip(ESTIMATE, 1000), 1900)
    expect(t).toMatchObject({ status: 'agreed', agreedCents: 1900 })
  })

  it('a low counter brings the quote down, but never below the floor', () => {
    let t = openTrip(ESTIMATE, 500)
    const quotes = [t.quoteCents]
    for (let i = 0; i < MAX_ROUNDS && !isClosed(t) && !t.final; i++) {
      t = counter(t, 500)
      quotes.push(t.quoteCents)
    }
    for (const q of quotes) expect(q).toBeGreaterThanOrEqual(FLOOR)
    for (let i = 1; i < quotes.length; i++) expect(quotes[i]).toBeLessThanOrEqual(quotes[i - 1])
  })

  it('after MAX_ROUNDS low counters the dispatcher makes a final offer at the floor', () => {
    let t = openTrip(ESTIMATE, 500)
    for (let i = 0; i < MAX_ROUNDS; i++) t = counter(t, 500)
    expect(t.final).toBe(true)
    expect(t.quoteCents).toBe(FLOOR)
    expect(() => counter(t, 500)).toThrow(/final offer/)
    expect(customerMove(t, ESTIMATE, { type: 'accept' })).toMatchObject({ status: 'agreed', agreedCents: FLOOR })
  })

  it('never lets a deal happen below the floor, whatever the customer does', () => {
    for (let offer = 5; offer < 2500; offer += 5) {
      let t = openTrip(ESTIMATE, offer)
      for (let r = 0; r < MAX_ROUNDS + 1 && !isClosed(t) && !t.final; r++) {
        t = counter(t, Math.max(5, Math.min(offer, t.quoteCents - 5)))
      }
      if (t.status === 'agreed') expect(t.agreedCents).toBeGreaterThanOrEqual(FLOOR)
    }
  })

  it('refuses a counter at or above the quote, and nonsense counters', () => {
    const t = openTrip(ESTIMATE, 1000)
    expect(() => counter(t, t.quoteCents)).toThrow(/accept/)
    expect(() => counter(t, 0)).toThrow()
    expect(() => counter(t, 12.5)).toThrow()
  })

  it('refuses any move once agreed or cancelled', () => {
    const agreed = openTrip(ESTIMATE, 1900)
    const cancelled = customerMove(openTrip(ESTIMATE, 1000), ESTIMATE, { type: 'cancel' })
    for (const closed of [agreed, cancelled]) {
      expect(() => customerMove(closed, ESTIMATE, { type: 'accept' })).toThrow(/already/)
      expect(() => customerMove(closed, ESTIMATE, { type: 'cancel' })).toThrow(/already/)
    }
  })

  it('records every turn in order', () => {
    const t = counter(openTrip(ESTIMATE, 1000), 1500)
    expect(t.log.map((x) => x.from)).toEqual(['customer', 'dispatcher', 'customer', 'dispatcher'])
  })
})

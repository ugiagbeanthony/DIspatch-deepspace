import { describe, expect, it } from 'vitest'
import {
  MAX_ROUNDS,
  customerMaxCents,
  dispatcherMove,
  isClosed,
  newNegotiation,
  MAX_CUSTOMER_PRICE_CENTS,
  parseCustomerPrice,
  parseDollars,
  type Negotiation,
} from './customer'

const PROPOSED = 2000 // customer offers $20.00
const MAX = customerMaxCents(PROPOSED) // hidden: $25.00

const quote = (n: Negotiation, cents: number) => dispatcherMove(n, { type: 'quote', cents }, PROPOSED)

describe('simulated customer', () => {
  it('has a hidden maximum 25% over their proposal', () => {
    expect(MAX).toBe(2500)
  })

  it('accepts a quote at or below their own proposal straight away', () => {
    const n = quote(newNegotiation(), 1800)
    expect(n.status).toBe('agreed')
    expect(n.agreedCents).toBe(1800)
  })

  it('haggles once on a quote inside their range, then accepts the same quote', () => {
    const first = quote(newNegotiation(), 2400)
    expect(first.status).toBe('countered')
    expect(first.counterCents).toBeGreaterThanOrEqual(PROPOSED)
    expect(first.counterCents).toBeLessThan(2400)
    const second = quote(first, 2400)
    expect(second.status).toBe('agreed')
    expect(second.agreedCents).toBe(2400)
  })

  it('counters inside [proposal, maximum] when the quote is too high', () => {
    const n = quote(newNegotiation(), 4000)
    expect(n.status).toBe('countered')
    expect(n.counterCents).toBeGreaterThanOrEqual(PROPOSED)
    expect(n.counterCents).toBeLessThanOrEqual(MAX)
  })

  it('cancels after MAX_ROUNDS quotes above their maximum', () => {
    let n = newNegotiation()
    for (let i = 1; i < MAX_ROUNDS; i++) {
      n = quote(n, 4000)
      expect(n.status).toBe('countered')
    }
    n = quote(n, 4000)
    expect(n.status).toBe('cancelled')
    expect(n.log.at(-1)?.note).toMatch(/another ride/)
  })

  it('never agrees to more than their maximum, whatever the dispatcher quotes', () => {
    for (let q = 1; q <= PROPOSED * 10; q += 5) {
      let n = newNegotiation()
      for (let r = 0; r < MAX_ROUNDS && !isClosed(n); r++) n = quote(n, q)
      if (n.status === 'agreed') expect(n.agreedCents).toBeLessThanOrEqual(MAX)
    }
  })
})

describe('dispatcher moves', () => {
  it('accepting the customer’s proposed price agrees at exactly that price', () => {
    const n = dispatcherMove(newNegotiation(), { type: 'accept-proposed' }, PROPOSED)
    expect(n).toMatchObject({ status: 'agreed', agreedCents: PROPOSED })
  })

  it('accepting a counter-offer agrees at the counter', () => {
    const countered = quote(newNegotiation(), 4000)
    const n = dispatcherMove(countered, { type: 'accept-counter' }, PROPOSED)
    expect(n).toMatchObject({ status: 'agreed', agreedCents: countered.counterCents })
  })

  it('cannot accept a counter that does not exist', () => {
    expect(() => dispatcherMove(newNegotiation(), { type: 'accept-counter' }, PROPOSED)).toThrow(/counter-offer/)
  })

  it('rejecting the job ends it', () => {
    expect(dispatcherMove(newNegotiation(), { type: 'reject' }, PROPOSED).status).toBe('rejected')
  })

  it('can counter back after a counter-offer, and keep going', () => {
    const a = quote(newNegotiation(), 4000)
    const b = quote(a, 2800)
    expect(b.round).toBe(2)
    expect(['countered', 'agreed']).toContain(b.status)
  })

  it('refuses a nonsense quote', () => {
    for (const bad of [0, -5, 12.5, PROPOSED * 10 + 1]) {
      expect(() => quote(newNegotiation(), bad)).toThrow()
    }
  })

  it('refuses any further move once agreed, cancelled or rejected', () => {
    const agreed = dispatcherMove(newNegotiation(), { type: 'accept-proposed' }, PROPOSED)
    const rejected = dispatcherMove(newNegotiation(), { type: 'reject' }, PROPOSED)
    let cancelled = newNegotiation()
    for (let i = 0; i < MAX_ROUNDS; i++) cancelled = quote(cancelled, 4000)
    for (const closed of [agreed, rejected, cancelled]) {
      expect(() => quote(closed, 2000)).toThrow(/already/)
      expect(() => dispatcherMove(closed, { type: 'reject' }, PROPOSED)).toThrow(/already/)
    }
  })

  it('needs a customer price to negotiate at all', () => {
    expect(() => dispatcherMove(newNegotiation(), { type: 'accept-proposed' }, 0)).toThrow(/no customer price/)
  })

  it('records every turn, in order', () => {
    const n = quote(newNegotiation(), 2400)
    expect(n.log.map((t) => t.from)).toEqual(['dispatcher', 'customer'])
  })
})

describe('parseDollars', () => {
  it('reads dollars into cents', () => {
    expect(parseDollars('12.50')).toEqual({ cents: 1250 })
    expect(parseDollars('$7')).toEqual({ cents: 700 })
  })
  it('rejects junk, zero and extra decimals', () => {
    for (const bad of ['', 'abc', '0', '-3', '1.234', '1,50']) expect('error' in parseDollars(bad)).toBe(true)
  })
})

describe('parseCustomerPrice', () => {
  it('accepts a normal offer and the largest allowed one', () => {
    expect(parseCustomerPrice('18.50')).toEqual({ cents: 1850 })
    expect(parseCustomerPrice(String(MAX_CUSTOMER_PRICE_CENTS / 100))).toEqual({ cents: MAX_CUSTOMER_PRICE_CENTS })
  })

  it('refuses a typo-sized price (the $1,000,000,000 that broke the chart)', () => {
    expect('error' in parseCustomerPrice('1000000000')).toBe(true)
    expect('error' in parseCustomerPrice('501')).toBe(true)
  })

  it('still reports ordinary bad input', () => {
    expect('error' in parseCustomerPrice('abc')).toBe(true)
  })
})

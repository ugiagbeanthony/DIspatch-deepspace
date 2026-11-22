/**
 * The customer's side of a price negotiation: YOU ask for a ride and offer a
 * price; a SIMULATED dispatcher answers. PURE and deterministic, so the
 * simulated dispatcher can never be talked below their own lowest price.
 *
 * It mirrors negotiation/customer.ts (where the human is the dispatcher and the
 * customer is simulated). Here the human is the customer.
 *
 * The simulated dispatcher prices a trip from the fare history (an `estimate`
 * passed in by the server), then:
 *  - accepts any offer at or above a hidden floor (90% of the estimate);
 *  - otherwise quotes, and comes down toward the customer each round, never
 *    below the floor;
 *  - after MAX_ROUNDS counters, makes one final take-it-or-leave-it offer.
 *
 * Invariants (all tested): the quote never drops below the floor; it only ever
 * goes down; a deal is never struck below the floor; nothing happens once a
 * trip is agreed or cancelled.
 */

export const MAX_ROUNDS = 3

export type TripStatus = 'quoted' | 'agreed' | 'cancelled'

export interface Turn {
  from: 'customer' | 'dispatcher'
  cents: number
  note: string
}

export interface Trip {
  status: TripStatus
  /** Counter-offers the customer has made. */
  round: number
  /** What the customer last offered. */
  offerCents: number
  /** The simulated dispatcher's current quote (0 once agreed or cancelled). */
  quoteCents: number
  /** True once the quote is take-it-or-leave-it. */
  final: boolean
  agreedCents: number
  log: Turn[]
}

export type CustomerMove = { type: 'accept' } | { type: 'counter'; cents: number } | { type: 'cancel' }

const ceil5 = (n: number) => Math.ceil(n / 5) * 5

/** The lowest fare the simulated dispatcher will take. Hidden. */
export const dispatcherFloorCents = (estimateCents: number) => ceil5(estimateCents * 0.9)

/** Where the simulated dispatcher opens, a little above the estimate. */
export const openingQuoteCents = (estimateCents: number) => ceil5(estimateCents * 1.05)

export const isClosed = (t: Trip) => t.status !== 'quoted'

/** The customer asks for a ride and offers a price; the dispatcher answers. */
export function openTrip(estimateCents: number, offerCents: number): Trip {
  if (!Number.isInteger(estimateCents) || estimateCents <= 0) throw new Error('No price estimate available')
  if (!Number.isInteger(offerCents) || offerCents <= 0) throw new Error('Offer must be a positive whole number of cents')

  const floor = dispatcherFloorCents(estimateCents)
  const customerTurn: Turn = { from: 'customer', cents: offerCents, note: 'You asked for a ride and offered' }

  if (offerCents >= floor) {
    return {
      status: 'agreed',
      round: 0,
      offerCents,
      quoteCents: 0,
      final: false,
      agreedCents: offerCents,
      log: [customerTurn, { from: 'dispatcher', cents: offerCents, note: 'Deal.' }],
    }
  }

  const quote = openingQuoteCents(estimateCents)
  return {
    status: 'quoted',
    round: 0,
    offerCents,
    quoteCents: quote,
    final: false,
    agreedCents: 0,
    log: [customerTurn, { from: 'dispatcher', cents: quote, note: 'Quoted' }],
  }
}

export function customerMove(t: Trip, estimateCents: number, move: CustomerMove): Trip {
  if (isClosed(t)) throw new Error(`This trip is already ${t.status}`)

  if (move.type === 'cancel') {
    return { ...t, status: 'cancelled', quoteCents: 0, log: [...t.log, { from: 'customer', cents: 0, note: 'You cancelled.' }] }
  }

  if (move.type === 'accept') {
    return {
      ...t,
      status: 'agreed',
      agreedCents: t.quoteCents,
      quoteCents: 0,
      log: [...t.log, { from: 'customer', cents: t.quoteCents, note: 'You accepted' }],
    }
  }

  // counter
  const c = move.cents
  if (t.final) throw new Error('That was the final offer: accept it or cancel')
  if (!Number.isInteger(c) || c <= 0) throw new Error('Offer must be a positive whole number of cents')
  if (c >= t.quoteCents) throw new Error('Your offer is at or above the quote; just accept it')

  const floor = dispatcherFloorCents(estimateCents)
  const round = t.round + 1
  const log: Turn[] = [...t.log, { from: 'customer', cents: c, note: 'You offered' }]

  if (c >= floor) {
    return {
      ...t,
      status: 'agreed',
      round,
      offerCents: c,
      agreedCents: c,
      quoteCents: 0,
      log: [...log, { from: 'dispatcher', cents: c, note: 'Deal.' }],
    }
  }

  if (round >= MAX_ROUNDS) {
    return {
      ...t,
      round,
      offerCents: c,
      quoteCents: floor,
      final: true,
      log: [...log, { from: 'dispatcher', cents: floor, note: 'Final offer. Take it or leave it.' }],
    }
  }

  // Meet roughly in the middle: never below the floor, always below the last quote.
  let q = Math.max(floor, ceil5((t.quoteCents + c) / 2))
  if (q >= t.quoteCents) q = Math.max(floor, t.quoteCents - 5)
  return {
    ...t,
    round,
    offerCents: c,
    quoteCents: q,
    log: [...log, { from: 'dispatcher', cents: q, note: 'Counter-offer' }],
  }
}

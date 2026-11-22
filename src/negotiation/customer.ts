/**
 * Price negotiation between the DISPATCHER (the signed-in person) and a
 * SIMULATED CUSTOMER (the caller who asked for the ride). PURE and
 * deterministic: the customer's replies are decided here, in code, from a
 * hidden walk-away price, so the simulated customer cannot be talked above it.
 *
 * Three prices are in play:
 *   proposed - what the customer offers when they call (stored on the request);
 *   AI       - what the model suggests (stored on the fare);
 *   agreed   - what the dispatcher and customer settle on.
 *
 * The dispatcher may: accept the customer's price, quote a price (the AI's or
 * their own), accept the customer's counter-offer, or reject the job. The
 * customer may: accept a quote, counter it, or cancel ("nah, I don't want it").
 *
 * Invariants (all tested):
 *  - the customer never agrees to more than their hidden maximum;
 *  - a customer counter is always between their proposal and their maximum;
 *  - the customer cancels only after MAX_ROUNDS quotes above their maximum;
 *  - once agreed, cancelled or rejected, nothing more can happen.
 */

export const MAX_ROUNDS = 3

export type NegStatus = 'open' | 'countered' | 'agreed' | 'cancelled' | 'rejected'

export interface Turn {
  from: 'dispatcher' | 'customer'
  cents: number
  note: string
}

export interface Negotiation {
  status: NegStatus
  /** Quotes the dispatcher has made. */
  round: number
  quoteCents: number
  counterCents: number
  agreedCents: number
  log: Turn[]
}

export type Move =
  | { type: 'accept-proposed' }
  | { type: 'quote'; cents: number }
  | { type: 'accept-counter' }
  | { type: 'reject' }

export const newNegotiation = (): Negotiation => ({
  status: 'open',
  round: 0,
  quoteCents: 0,
  counterCents: 0,
  agreedCents: 0,
  log: [],
})

const ceil5 = (n: number) => Math.ceil(n / 5) * 5

/** The most this customer will pay: 25% over what they proposed. Hidden. */
export const customerMaxCents = (proposedCents: number) => ceil5(proposedCents * 1.25)

export const isClosed = (n: Negotiation) => n.status === 'agreed' || n.status === 'cancelled' || n.status === 'rejected'

/** Parse a typed price like "12.50" into cents, or an error message. */
export function parseDollars(text: string): { cents: number } | { error: string } {
  const t = text.trim().replace(/^\$/, '')
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return { error: 'Enter a price like 12.50' }
  const cents = Math.round(Number(t) * 100)
  if (cents <= 0) return { error: 'Price must be more than zero' }
  return { cents }
}

export function dispatcherMove(n: Negotiation, move: Move, proposedCents: number): Negotiation {
  if (!Number.isInteger(proposedCents) || proposedCents <= 0) throw new Error('This request has no customer price')
  if (isClosed(n)) throw new Error(`This negotiation is already ${n.status}`)

  switch (move.type) {
    case 'accept-proposed':
      return {
        ...n,
        status: 'agreed',
        agreedCents: proposedCents,
        log: [
          ...n.log,
          { from: 'dispatcher', cents: proposedCents, note: 'Accepted the customer’s price.' },
          { from: 'customer', cents: proposedCents, note: 'Great, deal.' },
        ],
      }

    case 'accept-counter':
      if (n.status !== 'countered') throw new Error('The customer has not made a counter-offer')
      return {
        ...n,
        status: 'agreed',
        agreedCents: n.counterCents,
        log: [...n.log, { from: 'dispatcher', cents: n.counterCents, note: 'Accepted the counter-offer.' }],
      }

    case 'reject':
      return { ...n, status: 'rejected', log: [...n.log, { from: 'dispatcher', cents: 0, note: 'Rejected the job.' }] }

    case 'quote': {
      const q = move.cents
      if (!Number.isInteger(q) || q <= 0) throw new Error('Quote must be a positive whole number of cents')
      if (q > proposedCents * 10) throw new Error('That is more than 10 times the customer’s price')

      const round = n.round + 1
      const max = customerMaxCents(proposedCents)
      const log: Turn[] = [...n.log, { from: 'dispatcher', cents: q, note: 'Quoted.' }]
      const base = { ...n, round, quoteCents: q, log }
      const agree = (note: string): Negotiation => ({
        ...base,
        status: 'agreed',
        agreedCents: q,
        log: [...log, { from: 'customer', cents: q, note }],
      })

      // At or under what they proposed: easy yes.
      if (q <= proposedCents) return agree('Deal.')

      if (q <= max) {
        // Acceptable, but on the first quote they try to haggle it down a little.
        if (round > 1) return agree('Fine, deal.')
        const counter = ceil5((q + proposedCents) / 2)
        if (counter >= q) return agree('Deal.')
        return {
          ...base,
          status: 'countered',
          counterCents: counter,
          log: [...log, { from: 'customer', cents: counter, note: 'Can you do this instead?' }],
        }
      }

      // Above their maximum: counter inside their range, and eventually walk away.
      if (round >= MAX_ROUNDS) {
        return {
          ...base,
          status: 'cancelled',
          log: [...log, { from: 'customer', cents: 0, note: 'Too expensive. I will find another ride.' }],
        }
      }
      const counter = Math.min(max, ceil5(proposedCents + (max - proposedCents) / 2))
      return {
        ...base,
        status: 'countered',
        counterCents: counter,
        log: [...log, { from: 'customer', cents: counter, note: 'That is too high for me. How about this?' }],
      }
    }
  }
}

/** Read a stored negotiation log; anything unreadable is simply empty. */
export function parseTurns(json: string | undefined): Turn[] {
  try {
    const v = JSON.parse(json ?? '[]')
    return Array.isArray(v) ? (v as Turn[]) : []
  } catch {
    return []
  }
}

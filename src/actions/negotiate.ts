/**
 * negotiate: one move in the price negotiation between the dispatcher (the
 * caller) and the simulated customer. The customer's reply is decided HERE, in
 * code (negotiation/customer.ts), so a browser cannot make the customer agree
 * to anything. The customer's hidden maximum is never stored or sent.
 *
 * When a price is agreed it becomes the fare's final price, which is the price
 * a job is later sent to a driver at.
 */

import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import {
  MAX_CUSTOMER_PRICE_CENTS,
  dispatcherMove,
  newNegotiation,
  type Move,
  type Negotiation,
  type Turn,
} from '../negotiation/customer'
import { fail, getFields, getOwnedRequest, isDispatcher, ok, roleOf, str } from './common'

export function negotiationFrom(fields: Record<string, unknown> | null): Negotiation {
  if (!fields) return newNegotiation()
  let log: Turn[] = []
  try {
    const v = JSON.parse(String(fields.log ?? '[]'))
    if (Array.isArray(v)) log = v as Turn[]
  } catch {
    /* an unreadable log just starts empty */
  }
  return {
    status: (fields.status as Negotiation['status']) ?? 'open',
    round: Number(fields.round ?? 0),
    quoteCents: Number(fields.quoteCents ?? 0),
    counterCents: Number(fields.counterCents ?? 0),
    agreedCents: Number(fields.agreedCents ?? 0),
    log,
  }
}

function moveFrom(params: Record<string, unknown>): Move | null {
  switch (params.move) {
    case 'accept-proposed':
      return { type: 'accept-proposed' }
    case 'accept-counter':
      return { type: 'accept-counter' }
    case 'reject':
      return { type: 'reject' }
    case 'quote':
      return typeof params.cents === 'number' ? { type: 'quote', cents: params.cents } : null
    default:
      return null
  }
}

export const negotiate: ActionHandler<Env> = async ({ userId, params, tools, env }) => {
  if (!isDispatcher(await roleOf(env, userId))) return fail('Only dispatchers can negotiate')
  const requestId = str(params.requestId)
  const move = moveFrom(params)
  if (!requestId || !move) return fail('requestId and a valid move are required')

  const req = await getOwnedRequest(tools, requestId, userId)
  if (!req) return fail('Request not found')
  const proposed = req.proposedCents
  if (typeof proposed !== 'number' || proposed <= 0) {
    return fail("This request has no customer price. Add a new request with the customer's price.")
  }
  if (proposed > MAX_CUSTOMER_PRICE_CENTS) return fail('The customer price on this request looks wrong, so it cannot be negotiated.')
  const fare = await getFields(tools, 'fares', `fare-${requestId}`)
  if (!fare) return fail('Price the request first')

  const negId = `neg-${requestId}`
  const current = negotiationFrom(await getFields(tools, 'negotiations', negId))

  let next: Negotiation
  try {
    next = dispatcherMove(current, move, proposed)
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'That move is not allowed')
  }

  const saved = await tools.create(
    'negotiations',
    {
      requestId,
      status: next.status,
      round: next.round,
      quoteCents: next.quoteCents,
      counterCents: next.counterCents,
      agreedCents: next.agreedCents,
      log: JSON.stringify(next.log),
    },
    negId,
  )
  if (!saved.success) return fail(`Could not save negotiation: ${saved.error}`)

  if (next.status === 'agreed') {
    const ai = Number(fare.modelTotalCents)
    await tools.update('fares', `fare-${requestId}`, {
      finalCents: next.agreedCents,
      overridden: next.agreedCents !== ai ? 1 : 0,
      overrideReason: next.agreedCents !== ai ? 'Agreed with the customer' : '',
    })
    await tools.update('requests', requestId, { status: 'agreed' })
  } else if (next.status === 'cancelled' || next.status === 'rejected') {
    await tools.update('requests', requestId, { status: next.status })
  } else {
    await tools.update('requests', requestId, { status: 'negotiating' })
  }

  return ok({ status: next.status, agreedCents: next.agreedCents, counterCents: next.counterCents })
}

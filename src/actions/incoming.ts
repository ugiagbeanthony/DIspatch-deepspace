/**
 * incoming-request: a new request reaches the caller's console from a simulated
 * customer. Dispatchers no longer log requests by hand; requests come in. The
 * request is created as the caller, so it is theirs alone, and the number of
 * requests is capped so the list cannot grow without limit.
 */

import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { incomingRequestFor } from '../seed/generate'
import { fail, isDispatcher, ok, roleOf } from './common'

/** Most requests one dispatcher can hold (hidden ones count). */
export const MAX_REQUESTS = 30

export const incomingRequest: ActionHandler<Env> = async ({ userId, tools, env }) => {
  if (!isDispatcher(await roleOf(env, userId))) return fail('Only dispatchers receive requests')

  const mine = await tools.query('requests', { where: { createdBy: userId }, limit: MAX_REQUESTS + 1 })
  const count = mine.success ? mine.data.records.length : 0
  if (count >= MAX_REQUESTS) return fail('Your inbox is full. Finish or hide some requests first.')

  const r = incomingRequestFor(userId, count)
  const saved = await tools.create('requests', r.data, r.recordId)
  if (!saved.success) return fail(`Could not receive the request: ${saved.error}`)
  return ok({ requestId: r.recordId })
}

/**
 * demo-requests: give the caller their own copy of the six demo requests.
 * Ids include the caller's user id and rows are created as them, so every
 * dispatcher has a private workspace. Existing ones are left alone, so asking
 * again never resets a request you have already worked on.
 */

import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { demoRequestsFor } from '../seed/generate'
import { fail, isDispatcher, ok, roleOf } from './common'

export const demoRequests: ActionHandler<Env> = async ({ userId, tools, env }) => {
  if (!isDispatcher(await roleOf(env, userId))) return fail('Only dispatchers can add demo requests')
  let created = 0
  for (const r of demoRequestsFor(userId)) {
    const existing = await tools.get('requests', r.recordId)
    if (existing.success) continue
    const saved = await tools.create('requests', r.data, r.recordId)
    if (!saved.success) return fail(`Could not add demo request: ${saved.error}`)
    created++
  }
  return ok({ created })
}

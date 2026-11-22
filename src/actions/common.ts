/**
 * Shared helpers for server actions.
 *
 * Trust model (see src/server/action-routes.ts): actions run with per-record
 * RBAC OFF. The worker has verified WHO is calling, but nothing here checks
 * WHAT they may do, so every action must check the caller's role and any
 * ownership itself, before it touches `tools`.
 */

import { resolveAppRole } from 'deepspace/worker'
import type { ActionResult, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import { isSimulatedId } from '../dispatch/offers'

export const fail = (error: string): ActionResult => ({ success: false, error })
export const ok = <T>(data: T): ActionResult<T> => ({ success: true, data })

export type AppRole = 'admin' | 'member' | 'viewer'

export async function roleOf(env: Env, userId: string): Promise<AppRole> {
  return (await resolveAppRole(env, userId)) as AppRole
}

/** Dispatchers are `member`; the owner (`admin`) can do everything they can. */
export const isDispatcher = (role: AppRole) => role === 'member' || role === 'admin'

export const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)

/** Fields of a record returned by `tools.get`. */
export async function getFields(
  tools: ActionTools,
  collection: string,
  recordId: string,
): Promise<Record<string, unknown> | null> {
  const r = await tools.get(collection, recordId)
  return r.success ? (r.data.record.data as Record<string, unknown>) : null
}

/** Write an in-app notification. Simulated recipients have no screen, so skip them. */
export async function notify(
  tools: ActionTools,
  userId: string | undefined | null,
  notice: { kind: string; title: string; body: string },
  recordId?: string,
): Promise<void> {
  if (!userId || isSimulatedId(userId)) return
  await tools.create('notifications', { userId, ...notice, read: 0 }, recordId)
}

/**
 * A request, but only if the caller created it. Actions bypass per-record
 * permissions, so without this a dispatcher could price, negotiate or send
 * ANOTHER dispatcher's request just by knowing its id. A request that is not
 * yours is reported as not found, so its existence is not revealed.
 */
export async function getOwnedRequest(
  tools: ActionTools,
  requestId: string,
  userId: string,
): Promise<Record<string, unknown> | null> {
  const r = await tools.get('requests', requestId)
  if (!r.success) return null
  if (r.data.record.createdBy !== userId) return null
  return r.data.record.data as Record<string, unknown>
}

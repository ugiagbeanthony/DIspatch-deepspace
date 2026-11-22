/**
 * Call a server action (POST /api/actions/<name>) as the signed-in person.
 * The action runs with THEIR identity and, for the pricing action, their
 * DeepSpace credits.
 */

import { getAuthToken } from 'deepspace'

export type ActionOutcome<T> = { ok: true; data: T } | { ok: false; error: string }

export async function callAction<T = unknown>(
  name: string,
  params: Record<string, unknown> = {},
): Promise<ActionOutcome<T>> {
  try {
    const token = await getAuthToken()
    if (!token) return { ok: false, error: 'You are signed out. Sign in again.' }
    const res = await fetch(`/api/actions/${encodeURIComponent(name)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(params),
    })
    const body = (await res.json().catch(() => ({}))) as {
      success?: boolean
      data?: T
      error?: string
    }
    if (res.ok && body.success) return { ok: true, data: body.data as T }
    return { ok: false, error: body.error || `Request failed (${res.status})` }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Network error' }
  }
}

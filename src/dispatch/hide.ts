/**
 * Hiding a request removes it from your lists so they do not pile up. It is a
 * flag, not a delete: the request, its price and its agreement stay on record
 * (your agreement charts still count it) and can be shown again.
 *
 * A request cannot be hidden while it is still in play.
 */

import { jobPhase } from './offers'

interface OfferLike {
  status: string
  etaMin: number
  acceptedAt?: number
}

/** Why this request cannot be hidden right now, or null when it can. */
export function hideBlockReason(status: string, offers: OfferLike[], nowMs: number): string | null {
  if (status === 'negotiating') return 'Finish or reject the negotiation first.'
  if (offers.some((o) => o.status === 'pending')) return 'A job is waiting for a driver.'
  if (offers.some((o) => jobPhase(o, nowMs) === 'in-progress')) return 'A job is in progress.'
  return null
}

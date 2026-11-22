/**
 * Hiding a request removes it from your lists so they do not pile up. It is a
 * flag, not a delete: the request, its price and its agreement stay on record
 * (your agreement charts still count it) and can be shown again.
 *
 * Only a FINISHED request can be hidden: completed, rejected, or cancelled by
 * the customer. Anything still in play cannot be tidied away.
 */

import { isFinal } from './queue'
import { jobPhase } from './offers'

interface OfferLike {
  status: string
  etaMin: number
  acceptedAt?: number
}

/** Why this request cannot be hidden right now, or null when it can. */
export function hideBlockReason(status: string, offers: OfferLike[], nowMs: number): string | null {
  if (isFinal(status, offers, nowMs)) return null
  if (status === 'negotiating') return 'Still being negotiated. Finish or reject it first.'
  if (offers.some((o) => jobPhase(o, nowMs) === 'pending')) return 'A job is waiting for a driver.'
  if (offers.some((o) => jobPhase(o, nowMs) === 'in-progress')) return 'A job is in progress.'
  return 'Only finished requests can be hidden: completed, rejected or cancelled.'
}

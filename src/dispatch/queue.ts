/**
 * The dispatcher's queue. PURE.
 *
 * Every request is in one of three states of play:
 *   unattended   waiting on the dispatcher (new, priced, being negotiated, price
 *                agreed but not sent, or a driver declined and it needs sending
 *                again);
 *   in-progress  with a driver (a job is out, or a driver is on the way);
 *   final        done: completed, rejected by the dispatcher, or cancelled by
 *                the customer.
 *
 * Work is taken in the order it arrived, so the console lists unattended
 * requests first, OLDEST FIRST (the one that has waited longest is on top),
 * then in-progress ones, then finished ones newest first.
 */

import { jobPhase } from './offers'

export type Bucket = 'unattended' | 'in-progress' | 'final'

interface OfferLike {
  status: string
  etaMin: number
  acceptedAt?: number
}

/** Done, rejected or cancelled: nothing more to do with this request. */
export function isFinal(status: string, offers: OfferLike[], nowMs: number): boolean {
  if (status === 'rejected' || status === 'cancelled') return true
  // Completed: a driver accepted and the trip's demo clock has run out.
  return offers.some((o) => o.status === 'accepted' && jobPhase(o, nowMs) === 'done')
}

export function bucketOf(status: string, offers: OfferLike[], nowMs: number): Bucket {
  if (isFinal(status, offers, nowMs)) return 'final'
  // A job is out with a driver, or a driver is on the way.
  if (offers.some((o) => jobPhase(o, nowMs) === 'pending' || jobPhase(o, nowMs) === 'in-progress')) {
    return 'in-progress'
  }
  return 'unattended'
}

const RANK: Record<Bucket, number> = { unattended: 0, 'in-progress': 1, final: 2 }

export interface QueueItem<T> {
  item: T
  bucket: Bucket
}

/**
 * Put requests in queue order: unattended and in-progress oldest first, finished
 * newest first. Ties keep their original order.
 */
export function orderQueue<T>(
  items: T[],
  get: (item: T) => { status: string; offers: OfferLike[]; createdMs: number },
  nowMs: number,
): QueueItem<T>[] {
  return items
    .map((item, i) => {
      const g = get(item)
      return { item, i, createdMs: g.createdMs, bucket: bucketOf(g.status, g.offers, nowMs) }
    })
    .sort((a, b) => {
      if (RANK[a.bucket] !== RANK[b.bucket]) return RANK[a.bucket] - RANK[b.bucket]
      const byAge = a.bucket === 'final' ? b.createdMs - a.createdMs : a.createdMs - b.createdMs
      return byAge || a.i - b.i
    })
    .map(({ item, bucket }) => ({ item, bucket }))
}

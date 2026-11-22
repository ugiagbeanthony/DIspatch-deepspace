import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { price } from './price'
import { negotiate } from './negotiate'
import { demoRequests } from './demo-requests'
import { tripMove, tripRequest } from './trips'
import { demoJobs, respondOffer, sendOffer, simulateReply } from './offers'

/**
 * Server actions, called as POST /api/actions/<name>. They run with per-record
 * RBAC off, so each checks the caller itself (see ./common.ts).
 */
export const actions: Record<string, ActionHandler<Env>> = {
  price,
  negotiate,
  'demo-requests': demoRequests,
  'trip-request': tripRequest,
  'trip-move': tripMove,
  'send-offer': sendOffer,
  'respond-offer': respondOffer,
  'simulate-reply': simulateReply,
  'demo-jobs': demoJobs,
}

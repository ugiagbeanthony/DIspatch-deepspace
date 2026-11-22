import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { price } from './price'
import { demoJobs, respondOffer, sendOffer, simulateReply } from './offers'

/**
 * Server actions, called as POST /api/actions/<name>. They run with per-record
 * RBAC off, so each checks the caller itself (see ./common.ts).
 */
export const actions: Record<string, ActionHandler<Env>> = {
  price,
  'send-offer': sendOffer,
  'respond-offer': respondOffer,
  'simulate-reply': simulateReply,
  'demo-jobs': demoJobs,
}

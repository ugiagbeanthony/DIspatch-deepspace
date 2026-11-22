/**
 * Offer actions. Offers and notifications are written ONLY here, with the
 * caller's role and ownership checked by hand (actions bypass per-record RBAC).
 *
 *   send-offer     dispatcher -> sends a priced request to a driver
 *   respond-offer  driver     -> accepts or declines THEIR OWN job
 *   simulate-reply dispatcher -> triggers a simulated driver's answer
 *   demo-jobs      anyone     -> three simulated jobs addressed to the caller
 */

import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import {
  buildOffer,
  demoJobsFor,
  distanceKm,
  isSimulatedId,
  newOfferNotice,
  replyNotice,
  simulatedReply,
} from '../dispatch/offers'
import { fail, getFields, isDispatcher, notify, ok, roleOf, str } from './common'

export const sendOffer: ActionHandler<Env> = async ({ userId, params, tools, env }) => {
  if (!isDispatcher(await roleOf(env, userId))) return fail('Only dispatchers can send jobs')
  const requestId = str(params.requestId)
  const driverUserId = str(params.driverUserId)
  if (!requestId || !driverUserId) return fail('requestId and driverUserId are required')

  const req = await getFields(tools, 'requests', requestId)
  if (!req) return fail('Request not found')
  const fare = await getFields(tools, 'fares', `fare-${requestId}`)
  if (!fare || typeof fare.finalCents !== 'number') return fail('Price the request first')

  const found = await tools.query('drivers', { where: { userId: driverUserId }, limit: 1 })
  const driver = found.success ? (found.data.records[0]?.data as Record<string, unknown> | undefined) : undefined
  if (!driver) return fail('Driver not found')
  if (driver.status !== 'free') return fail('That driver is busy')

  // Distance is recomputed here from stored coordinates, never taken from the browser.
  const km = distanceKm(
    { name: '', lat: Number(req.originLat), lng: Number(req.originLng) },
    { name: '', lat: Number(driver.lat), lng: Number(driver.lng) },
  )
  const data = buildOffer({
    requestId,
    origin: String(req.origin),
    destination: String(req.destination),
    fareCents: fare.finalCents,
    driverUserId,
    dispatcherId: userId,
    km,
    reason: `${km.toFixed(1)} km from pickup, ${Number(driver.rating).toFixed(1)} stars, free now`,
  })

  const offerId = `offer-${requestId}-${driverUserId}`
  const saved = await tools.create('offers', data, offerId)
  if (!saved.success) return fail(`Could not send job: ${saved.error}`)
  await tools.update('requests', requestId, { status: 'offered' })
  await notify(tools, driverUserId, newOfferNotice(data))

  return ok({ offerId, simulatedDriver: isSimulatedId(driverUserId) })
}

export const respondOffer: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const offerId = str(params.offerId)
  const status = params.status
  if (!offerId) return fail('offerId is required')
  if (status !== 'accepted' && status !== 'declined') return fail('status must be accepted or declined')

  const offer = await getFields(tools, 'offers', offerId)
  if (!offer) return fail('Job not found')
  // Ownership: a driver may answer only a job addressed to them.
  if (offer.driverId !== userId) return fail('That job is not yours')
  if (offer.status !== 'pending') return fail(`Job is already ${String(offer.status)}`)

  const upd = await tools.update('offers', offerId, { status })
  if (!upd.success) return fail(`Could not save answer: ${upd.error}`)

  const me = await getFields(tools, 'users', userId)
  const name = (me && typeof me.name === 'string' && me.name) || 'Your driver'
  await notify(tools, str(offer.dispatcherId), replyNotice(name, status, offer as { origin: string; destination: string }))
  const requestId = str(offer.requestId)
  if (requestId && !requestId.startsWith('demo-')) await tools.update('requests', requestId, { status })

  return ok({ offerId, status })
}

export const simulateReply: ActionHandler<Env> = async ({ userId, params, tools, env }) => {
  if (!isDispatcher(await roleOf(env, userId))) return fail('Only dispatchers can do this')
  const offerId = str(params.offerId)
  if (!offerId) return fail('offerId is required')

  const offer = await getFields(tools, 'offers', offerId)
  if (!offer) return fail('Job not found')
  const driverId = String(offer.driverId)
  if (!isSimulatedId(driverId)) return fail('Only simulated drivers can be answered for')
  if (offer.status !== 'pending') return fail(`Job is already ${String(offer.status)}`)

  const status = simulatedReply(driverId, offerId)
  const upd = await tools.update('offers', offerId, { status })
  if (!upd.success) return fail(`Could not save answer: ${upd.error}`)

  const found = await tools.query('drivers', { where: { userId: driverId }, limit: 1 })
  const name = (found.success && String(found.data.records[0]?.data.name)) || 'The driver'
  // The dispatcher who triggered it is the one to tell.
  await notify(tools, userId, replyNotice(`${name} (simulated)`, status, offer as { origin: string; destination: string }))
  const requestId = str(offer.requestId)
  if (requestId) await tools.update('requests', requestId, { status })

  return ok({ offerId, status })
}

export const demoJobs: ActionHandler<Env> = async ({ userId, tools }) => {
  const jobs = demoJobsFor(userId)
  for (const j of jobs) {
    const saved = await tools.create('offers', j.data, j.recordId)
    if (!saved.success) return fail(`Could not create demo job: ${saved.error}`)
  }
  await notify(tools, userId, newOfferNotice(jobs[0].data), `notice-demo-${userId}`)
  return ok({ created: jobs.length })
}

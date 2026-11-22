/**
 * price: suggest a fare for one request, billed to the CALLER's DeepSpace
 * credits (their token is forwarded to the model proxy), never the owner's.
 *
 * The model returns factor rows; code sums and verifies them
 * (pricing/reconcile.ts). If the caller has no credits, or the model keeps
 * failing, the fare falls back to the historical digest and says so.
 */

import { createDeepSpaceAI } from 'deepspace/worker'
import type { ActionHandler } from 'deepspace/worker'
import { generateText } from 'ai'
import type { Env } from '../../worker'
import { buildDigest, truthFareCents } from '../seed/generate'
import { priceRequest } from '../pricing/reconcile'
import { historyFromQuery, requestFromGet } from '../pricing/inputs'
import { fail, isDispatcher, ok, roleOf, str } from './common'

/** Cheapest Claude model that reliably returns JSON. */
export const PRICING_MODEL = 'claude-haiku-5-5'

export const price: ActionHandler<Env> = async ({ userId, params, tools, env, callerJwt }) => {
  if (!isDispatcher(await roleOf(env, userId))) return fail('Only dispatchers can price requests')
  const requestId = str(params.requestId)
  if (!requestId) return fail('requestId is required')

  try {
    const got = await tools.get('requests', requestId)
    if (!got.success) return fail('Request not found')
    const req = requestFromGet(got.data)

    const hist = await tools.query('fareHistory', { limit: 500 })
    if (!hist.success) return fail('Could not read fare history')
    const digest = buildDigest(historyFromQuery(hist.data))

    // The caller's own token: the model call is billed to THEIR credits.
    const model = createDeepSpaceAI(env, 'anthropic', { authToken: callerJwt })(PRICING_MODEL)
    const result = await priceRequest({
      digest,
      request: req,
      callModel: async (prompt) => (await generateText({ model, prompt })).text,
      onReject: (r) => console.warn(`[price] rejected request=${requestId} attempt=${r.attempt} reason=${r.reason}`),
    })

    const saved = await tools.create(
      'fares',
      {
        requestId,
        factors: JSON.stringify(result.factors),
        modelTotalCents: result.totalCents,
        finalCents: result.totalCents,
        overridden: 0,
        overrideReason: '',
        rejections: result.rejections.length,
        rejectionNotes: result.rejections.map((r) => `#${r.attempt}: ${r.reason}`).join(' | ').slice(0, 600),
        source: result.source,
        referenceCents: truthFareCents(req.origin, req.destination, req.hour, req.weather),
        // The request may be synthetic; the fare is a real model run on it.
        synthetic: 0,
      },
      `fare-${requestId}`,
    )
    if (!saved.success) return fail(`Could not save fare: ${saved.error}`)
    await tools.update('requests', requestId, { status: 'priced' })

    return ok({ requestId, totalCents: result.totalCents, source: result.source, rejections: result.rejections.length })
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Pricing failed')
  }
}

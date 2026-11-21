/**
 * Background-job handler - invoked by AppJobRoom (worker.ts) for every
 * job picked up from the queue. Dispatch on `job.type` and return a
 * result (captured as `job.result`) or throw to fail (retried up to
 * `maxAttempts`, then permanently marked failed).
 *
 * `ctx` gives you progress, an abort signal, and checkpointing - but no
 * record API. Jobs reach records through `createUserToolExecutor`, which
 * acts as a specific user id and is therefore subject to that user's
 * RBAC.
 *
 * Identity rule: a job acts as `job.enqueuedBy` (set by the server from the
 * authenticated connection), NEVER as an id read from `job.payload`. The
 * payload is client-controlled; trusting it would let any caller who can
 * enqueue run work as someone else. The queue itself is admin-only
 * (AppJobRoom.authorizeWrite), and handlers re-check the role they need.
 */

import type { Job, JobContext } from 'deepspace/worker'
import { createDeepSpaceAI, createUserToolExecutor } from 'deepspace/worker'
import { generateText } from 'ai'
import { buildDigest, generateDrivers, generateHistory, generateRequests, truthFareCents } from './seed/generate'
import { priceRequest } from './pricing/reconcile'
import type { Env } from '../worker'

type JobEnv = Env

/** Cheapest Claude model that reliably returns JSON. Billed to the app owner's
 *  credits, because a job has no caller token; only the dispatcher can enqueue. */
const PRICING_MODEL = 'claude-haiku-5-5'

export async function runJob(
  job: Job,
  ctx: JobContext,
  env: unknown,
): Promise<unknown> {
  switch (job.type) {
    case 'seed':
      return await seedDemoData(job, ctx, env as JobEnv)

    case 'price':
      return await priceOne(job, ctx, env as JobEnv)

    default:
      throw new Error(`Unknown job type: ${job.type}`)
  }
}

/** Tool results are `unknown`; refuse to carry on past an error result. */
function assertOk(result: unknown, what: string): void {
  const r = result as { error?: unknown; success?: unknown } | null
  if (r && typeof r === 'object' && (r.error || r.success === false)) {
    throw new Error(`${what} failed: ${JSON.stringify(r.error ?? r)}`)
  }
}

/**
 * Seed the synthetic demo fleet, requests and 14-day fare history.
 *
 * Runs as the dispatcher, so every write is checked by the same RBAC as any
 * other dispatcher write. Idempotent: record ids are deterministic and
 * `records.create` upserts, so running it twice leaves exactly one copy.
 */
async function seedDemoData(job: Job, ctx: JobContext, env: JobEnv): Promise<unknown> {
  const actor = job.enqueuedBy
  if (!actor) throw new Error('seed: job has no enqueuedBy; refusing to run')
  if (!env.OWNER_USER_ID || actor !== env.OWNER_USER_ID) {
    throw new Error('seed: only the app owner (dispatcher) may seed demo data')
  }

  const exec = createUserToolExecutor(env, actor, ctx.signal)
  const plan = [
    { collection: 'drivers', rows: generateDrivers() },
    { collection: 'requests', rows: generateRequests() },
    { collection: 'fareHistory', rows: generateHistory() },
  ]
  const total = plan.reduce((n, p) => n + p.rows.length, 0)

  let done = 0
  const written: Record<string, number> = {}
  for (const { collection, rows } of plan) {
    ctx.progress(done / total, `seeding ${collection}`)
    for (const row of rows) {
      const result = await exec('records.create', {
        collection,
        recordId: row.recordId,
        data: row.data,
      })
      assertOk(result, `records.create ${collection}/${row.recordId}`)
      done++
      if (done % 20 === 0) ctx.progress(done / total, `seeding ${collection}`)
    }
    written[collection] = rows.length
  }
  ctx.progress(1, 'done')
  return { synthetic: true, written }
}

/** Run a record tool and return its `data`, or throw on a failure result. */
async function must<T>(
  exec: ReturnType<typeof createUserToolExecutor>,
  tool: string,
  params: Record<string, unknown>,
): Promise<T> {
  const result = (await exec(tool, params)) as { success?: boolean; error?: unknown; data?: T }
  if (!result || result.success === false || result.error) {
    throw new Error(`${tool} failed: ${JSON.stringify(result?.error ?? result)}`)
  }
  return result.data as T
}

/** Records come back as `{recordId, data: {...}}`; tolerate a flat shape too. */
function fieldsOf(rec: unknown): Record<string, unknown> {
  const r = rec as { data?: Record<string, unknown> } & Record<string, unknown>
  return (r && typeof r.data === 'object' && r.data) || r
}

/**
 * Price one request: learn a digest from fare history, ask the model for a
 * factor breakdown, let CODE sum and verify it (see pricing/reconcile.ts), and
 * write exactly one fare per request. Re-pricing overwrites that fare.
 */
async function priceOne(job: Job, ctx: JobContext, env: JobEnv): Promise<unknown> {
  const actor = job.enqueuedBy
  if (!actor) throw new Error('price: job has no enqueuedBy; refusing to run')
  if (!env.OWNER_USER_ID || actor !== env.OWNER_USER_ID) {
    throw new Error('price: only the app owner (dispatcher) may price requests')
  }
  const requestId = (job.payload as { requestId?: unknown } | null)?.requestId
  if (typeof requestId !== 'string' || requestId === '') throw new Error('price: payload.requestId is required')

  const exec = createUserToolExecutor(env, actor, ctx.signal)

  ctx.progress(0.1, 'reading request and history')
  const req = fieldsOf(await must(exec, 'records.get', { collection: 'requests', recordId: requestId })) as {
    origin: string
    destination: string
    hour: number
    weather: string
    synthetic?: number
  }
  const hist = await must<{ records: unknown[] }>(exec, 'records.query', {
    collection: 'fareHistory',
    limit: 500,
  })
  const digest = buildDigest(
    hist.records.map(fieldsOf) as Array<{
      origin: string
      destination: string
      hour: number
      weather: string
      clearedCents: number
    }>,
  )
  if (digest.sampleSize === 0) throw new Error('price: no fare history; seed demo data first')

  ctx.progress(0.3, 'asking the model')
  const model = createDeepSpaceAI(env, 'anthropic')(PRICING_MODEL)
  const result = await priceRequest({
    digest,
    request: req,
    callModel: async (prompt) => (await generateText({ model, prompt, abortSignal: ctx.signal })).text,
    onReject: (r) =>
      console.warn(`[price] rejected request=${requestId} attempt=${r.attempt} reason=${r.reason}`),
  })

  ctx.progress(0.8, 'saving fare')
  const referenceCents = truthFareCents(req.origin, req.destination, req.hour, req.weather)
  await must(exec, 'records.create', {
    collection: 'fares',
    recordId: `fare-${requestId}`,
    data: {
      requestId,
      factors: JSON.stringify(result.factors),
      modelTotalCents: result.totalCents,
      finalCents: result.totalCents,
      overridden: 0,
      overrideReason: '',
      rejections: result.rejections.length,
      rejectionNotes: result.rejections.map((r) => `#${r.attempt}: ${r.reason}`).join(' | ').slice(0, 600),
      source: result.source,
      referenceCents,
      // The request is synthetic; the fare is a real model run on it.
      synthetic: 0,
    },
  })
  await must(exec, 'records.update', { collection: 'requests', recordId: requestId, data: { status: 'priced' } })

  ctx.progress(1, 'done')
  return { requestId, totalCents: result.totalCents, source: result.source, rejections: result.rejections.length }
}

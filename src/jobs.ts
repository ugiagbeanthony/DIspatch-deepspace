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
import { createUserToolExecutor } from 'deepspace/worker'
import { generateDrivers, generateHistory, generateRequests } from './seed/generate'
import type { Env } from '../worker'

type JobEnv = Env

export async function runJob(
  job: Job,
  ctx: JobContext,
  env: unknown,
): Promise<unknown> {
  switch (job.type) {
    case 'seed':
      return await seedDemoData(job, ctx, env as JobEnv)

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

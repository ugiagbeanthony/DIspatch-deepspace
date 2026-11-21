/**
 * Background-job handler — invoked by AppJobRoom (worker.ts) for every
 * job picked up from the queue. Dispatch on `job.type` and return a
 * result (captured as `job.result`) or throw to fail (retried up to
 * `maxAttempts`, then permanently marked failed).
 *
 * `ctx` gives you progress, an abort signal, and checkpointing — but no
 * record API. Jobs reach records through `createUserToolExecutor`, which
 * acts as a specific user id and is therefore subject to that user's
 * RBAC. Pick the id the work genuinely runs as: the dispatcher for
 * matching, the driver for a driver-initiated action.
 */

import type { Job, JobContext } from 'deepspace/worker'
import { createUserToolExecutor } from 'deepspace/worker'

export async function runJob(
  job: Job,
  ctx: JobContext,
  env: unknown,
): Promise<unknown> {
  switch (job.type) {
    /**
     * Spike probe: proves a background job can read and write app records.
     * Enqueue with `enqueueJob(env.JOB_ROOMS, roomId, 'probe', { asUserId })`.
     */
    case 'probe': {
      const { asUserId } = job.payload as { asUserId: string }

      ctx.progress(0.1, 'opening executor')
      const exec = createUserToolExecutor(
        env as Parameters<typeof createUserToolExecutor>[0],
        asUserId,
        ctx.signal,
      )

      const read = await exec('records.query', { collection: 'settings' })
      ctx.progress(0.5, 'read ok, writing')

      const write = await exec('records.create', {
        collection: 'settings',
        data: { key: 'spike:probe', value: new Date().toISOString() },
      })
      ctx.progress(1, 'done')

      return { read, write }
    }

    default:
      throw new Error(`Unknown job type: ${job.type}`)
  }
}

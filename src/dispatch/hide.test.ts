import { describe, expect, it } from 'vitest'
import { jobDurationMs } from './offers'
import { hideBlockReason } from './hide'

const T0 = 1_000_000

describe('hideBlockReason', () => {
  it('lets you hide finished and idle requests', () => {
    for (const status of ['open', 'priced', 'agreed', 'cancelled', 'rejected', 'declined']) {
      expect(hideBlockReason(status, [], T0), status).toBeNull()
    }
  })

  it('refuses while a negotiation is still going', () => {
    expect(hideBlockReason('negotiating', [], T0)).toMatch(/negotiation/)
  })

  it('refuses while a job is waiting for a driver', () => {
    expect(hideBlockReason('offered', [{ status: 'pending', etaMin: 3 }], T0)).toMatch(/waiting/)
  })

  it('refuses while a job is in progress, then allows it once the job is done', () => {
    const job = { status: 'accepted', etaMin: 3, acceptedAt: T0 }
    expect(hideBlockReason('accepted', [job], T0 + 1)).toMatch(/in progress/)
    expect(hideBlockReason('accepted', [job], T0 + jobDurationMs(3))).toBeNull()
  })

  it('allows hiding a request whose jobs were all declined', () => {
    expect(hideBlockReason('declined', [{ status: 'declined', etaMin: 3 }], T0)).toBeNull()
  })
})

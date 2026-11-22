import { describe, expect, it } from 'vitest'
import { jobDurationMs } from './offers'
import { hideBlockReason } from './hide'

const T0 = 1_000_000
const finishedJob = { status: 'accepted', etaMin: 3, acceptedAt: T0 - jobDurationMs(3) - 1 }

describe('hideBlockReason: only finished requests can be hidden', () => {
  it('lets you hide a rejected or cancelled request', () => {
    expect(hideBlockReason('rejected', [], T0)).toBeNull()
    expect(hideBlockReason('cancelled', [], T0)).toBeNull()
  })

  it('lets you hide a completed request, but not one whose job is still running', () => {
    expect(hideBlockReason('accepted', [finishedJob], T0)).toBeNull()
    const running = { status: 'accepted', etaMin: 3, acceptedAt: T0 }
    expect(hideBlockReason('accepted', [running], T0 + 1)).toMatch(/in progress/)
  })

  it('refuses requests that are new, priced, agreed or declined', () => {
    for (const status of ['open', 'priced', 'agreed', 'declined']) {
      expect(hideBlockReason(status, [], T0), status).toMatch(/Only finished/)
    }
  })

  it('explains why a negotiation or a waiting job blocks it', () => {
    expect(hideBlockReason('negotiating', [], T0)).toMatch(/negotiated/)
    expect(hideBlockReason('offered', [{ status: 'pending', etaMin: 3 }], T0)).toMatch(/waiting/)
  })
})

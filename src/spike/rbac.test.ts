/**
 * Role-based access, proven against the SDK's real permission predicate with
 * the real schemas: no mocks, no assumptions about how `'own'` is interpreted.
 *
 *   admin  = owner
 *   member = dispatcher (default for anyone who signs in)
 *   viewer = driver
 */

import { describe, expect, it } from 'vitest'
import { canCreate, canDelete, canRead, canUpdate } from 'deepspace/worker'
import { offersSchema } from '../schemas/offers-schema'
import {
  driversSchema,
  fareHistorySchema,
  faresSchema,
  negotiationsSchema,
  notificationsSchema,
  requestsSchema,
} from '../schemas/dispatch-schema'

const OWNER = 'user_owner'
const DISPATCHER = 'user_dispatcher'
const DRIVER_A = 'user_driver_a'
const DRIVER_B = 'user_driver_b'

const rec = (data: Record<string, unknown> = {}, createdBy = DISPATCHER) => ({
  recordId: 'r1',
  createdBy,
  data,
})

const offerForDriverA = rec({
  driverId: DRIVER_A,
  requestId: 'req_1',
  fareCents: 2840,
  etaMin: 4,
  status: 'pending',
})

describe('offers: private per driver, enforced at the permission check', () => {
  it('lets a driver read their own offer', () => {
    expect(canRead(offersSchema, 'viewer', offerForDriverA, DRIVER_A)).toBe(true)
  })

  it('hides a driver’s offer from every other driver', () => {
    expect(canRead(offersSchema, 'viewer', offerForDriverA, DRIVER_B)).toBe(false)
  })

  it('does not let a driver edit, create or delete offers (so no changing the price)', () => {
    expect(canUpdate(offersSchema, 'viewer', offerForDriverA, DRIVER_A)).toBe(false)
    expect(canCreate(offersSchema, 'viewer')).toBe(false)
    expect(canDelete(offersSchema, 'viewer', offerForDriverA, DRIVER_A)).toBe(false)
  })

  it('lets a dispatcher read across the fleet but not write directly', () => {
    expect(canRead(offersSchema, 'member', offerForDriverA, DISPATCHER)).toBe(true)
    expect(canCreate(offersSchema, 'member')).toBe(false)
    expect(canUpdate(offersSchema, 'member', offerForDriverA, DISPATCHER)).toBe(false)
  })

  it('gives the owner full access', () => {
    expect(canRead(offersSchema, 'admin', offerForDriverA, OWNER)).toBe(true)
    expect(canCreate(offersSchema, 'admin')).toBe(true)
  })

  it('shows nothing to anonymous callers', () => {
    expect(canRead(offersSchema, '*', offerForDriverA, 'anon_123')).toBe(false)
    expect(canCreate(offersSchema, '*')).toBe(false)
  })

  it('treats a stale ownership value as no access', () => {
    const orphan = rec({ ...offerForDriverA.data, driverId: '' })
    expect(canRead(offersSchema, 'viewer', orphan, DRIVER_A)).toBe(false)
    expect(canRead(offersSchema, 'viewer', orphan, '')).toBe(false)
  })
})

const OTHER_DISPATCHER = 'user_dispatcher_2'

describe('shared world: the fleet and fare history', () => {
  const shared = [driversSchema, fareHistorySchema]

  it('every dispatcher can read it, nobody but the owner can write it', () => {
    for (const s of shared) {
      expect(canRead(s, 'member', rec({}, OWNER), DISPATCHER)).toBe(true)
      expect(canRead(s, 'member', rec({}, OWNER), OTHER_DISPATCHER)).toBe(true)
      expect(canCreate(s, 'member')).toBe(false)
      expect(canUpdate(s, 'member', rec({}, OWNER), DISPATCHER)).toBe(false)
      expect(canCreate(s, 'admin')).toBe(true)
    }
  })

  it('a driver and a signed-out visitor cannot read it', () => {
    for (const s of shared) {
      expect(canRead(s, 'viewer', rec(), DRIVER_A)).toBe(false)
      expect(canRead(s, '*', rec(), 'anon')).toBe(false)
    }
  })
})

describe('private workspace: requests, fares and negotiations belong to the dispatcher who made them', () => {
  const personal = [requestsSchema, faresSchema, negotiationsSchema]
  const mine = rec({}, DISPATCHER)

  it('a dispatcher reads their own', () => {
    for (const s of personal) expect(canRead(s, 'member', mine, DISPATCHER)).toBe(true)
  })

  it('another dispatcher cannot read them', () => {
    for (const s of personal) expect(canRead(s, 'member', mine, OTHER_DISPATCHER)).toBe(false)
  })

  it('a dispatcher can add requests and update only their own', () => {
    expect(canCreate(requestsSchema, 'member')).toBe(true)
    expect(canUpdate(requestsSchema, 'member', mine, DISPATCHER)).toBe(true)
    expect(canUpdate(requestsSchema, 'member', mine, OTHER_DISPATCHER)).toBe(false)
  })

  it('fares and negotiations are written only by the server', () => {
    for (const s of [faresSchema, negotiationsSchema]) {
      expect(canCreate(s, 'member')).toBe(false)
      expect(canUpdate(s, 'member', mine, DISPATCHER)).toBe(false)
    }
  })

  it('a driver and a signed-out visitor see none of it', () => {
    for (const s of personal) {
      expect(canRead(s, 'viewer', mine, DRIVER_A)).toBe(false)
      expect(canRead(s, '*', mine, 'anon')).toBe(false)
    }
  })

  it('the owner (admin) can read and write all of it', () => {
    for (const s of personal) {
      expect(canRead(s, 'admin', mine, OWNER)).toBe(true)
      expect(canCreate(s, 'admin')).toBe(true)
      expect(canUpdate(s, 'admin', mine, OWNER)).toBe(true)
    }
  })
})

describe('notifications: each person reads only their own', () => {
  const forA = rec({ userId: DRIVER_A, title: 'New job', read: 0 })

  it('recipient reads and marks their own read', () => {
    expect(canRead(notificationsSchema, 'viewer', forA, DRIVER_A)).toBe(true)
    expect(canUpdate(notificationsSchema, 'viewer', forA, DRIVER_A)).toBe(true)
  })

  it('nobody else reads or marks it', () => {
    expect(canRead(notificationsSchema, 'viewer', forA, DRIVER_B)).toBe(false)
    expect(canRead(notificationsSchema, 'member', forA, DISPATCHER)).toBe(false)
    expect(canUpdate(notificationsSchema, 'member', forA, DISPATCHER)).toBe(false)
  })

  it('no client can create a notification (the server does)', () => {
    expect(canCreate(notificationsSchema, 'viewer')).toBe(false)
    expect(canCreate(notificationsSchema, 'member')).toBe(false)
    expect(canCreate(notificationsSchema, '*')).toBe(false)
  })
})

describe('negotiations: written only by the server action', () => {
  it('a dispatcher reads them but cannot write one directly (so cannot fake the customer)', () => {
    expect(canRead(negotiationsSchema, 'member', rec(), DISPATCHER)).toBe(true)
    expect(canCreate(negotiationsSchema, 'member')).toBe(false)
    expect(canUpdate(negotiationsSchema, 'member', rec(), DISPATCHER)).toBe(false)
  })

  it('a driver and a signed-out visitor see none', () => {
    expect(canRead(negotiationsSchema, 'viewer', rec(), DRIVER_A)).toBe(false)
    expect(canRead(negotiationsSchema, '*', rec(), 'anon')).toBe(false)
  })
})

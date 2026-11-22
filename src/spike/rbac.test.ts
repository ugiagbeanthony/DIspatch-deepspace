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

describe('console data: dispatchers work it, drivers cannot see it', () => {
  const consoleSchemas = [driversSchema, requestsSchema, faresSchema, fareHistorySchema]

  it('a driver can read none of the console (no request queue, no fleet, no fares)', () => {
    for (const s of consoleSchemas) {
      expect(canRead(s, 'viewer', rec(), DRIVER_A)).toBe(false)
    }
  })

  it('a dispatcher reads all of it', () => {
    for (const s of consoleSchemas) {
      expect(canRead(s, 'member', rec(), DISPATCHER)).toBe(true)
    }
  })

  it('a dispatcher can add and update requests', () => {
    expect(canCreate(requestsSchema, 'member')).toBe(true)
    expect(canUpdate(requestsSchema, 'member', rec(), DISPATCHER)).toBe(true)
  })

  it('a dispatcher can adjust a fare but cannot invent one (the server creates it)', () => {
    expect(canUpdate(faresSchema, 'member', rec(), DISPATCHER)).toBe(true)
    expect(canCreate(faresSchema, 'member')).toBe(false)
  })

  it('a dispatcher cannot rewrite the fleet or the fare history', () => {
    for (const s of [driversSchema, fareHistorySchema]) {
      expect(canCreate(s, 'member')).toBe(false)
      expect(canUpdate(s, 'member', rec(), DISPATCHER)).toBe(false)
    }
  })

  it('nobody signed out sees any of it', () => {
    for (const s of consoleSchemas) {
      expect(canRead(s, '*', rec(), 'anon')).toBe(false)
    }
  })

  it('the owner can write everything', () => {
    for (const s of consoleSchemas) {
      expect(canCreate(s, 'admin')).toBe(true)
      expect(canUpdate(s, 'admin', rec(), OWNER)).toBe(true)
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

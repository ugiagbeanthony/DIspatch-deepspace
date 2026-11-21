/**
 * Increment 0 — RBAC proof.
 *
 * Exercises the SDK's real permission predicate against the real offers
 * schema: no mocks, no assumptions about how `'own'` is interpreted.
 * This is the executable version of "driver B cannot see driver A's offer".
 */

import { describe, expect, it } from 'vitest'
import { canCreate, canRead, canUpdate } from 'deepspace/worker'
import { offersSchema } from '../schemas/offers-schema'

const DISPATCHER = 'user_dispatcher'
const DRIVER_A = 'user_driver_a'
const DRIVER_B = 'user_driver_b'

const offerForDriverA = {
  recordId: 'off_1',
  createdBy: DISPATCHER,
  data: {
    driverId: DRIVER_A,
    requestId: 'req_1',
    fareCents: 2840,
    etaMin: 4,
    reason: '0.4 mi away, 4.9 stars, no open offers',
    status: 'pending',
  },
}

describe('offers RBAC', () => {
  it('lets a driver read and answer their own offer', () => {
    expect(canRead(offersSchema, 'member', offerForDriverA, DRIVER_A)).toBe(true)
    expect(canUpdate(offersSchema, 'member', offerForDriverA, DRIVER_A)).toBe(true)
  })

  it('hides a driver’s offer from every other driver', () => {
    expect(canRead(offersSchema, 'member', offerForDriverA, DRIVER_B)).toBe(false)
    expect(canUpdate(offersSchema, 'member', offerForDriverA, DRIVER_B)).toBe(false)
  })

  it('lets a dispatcher read across the fleet', () => {
    expect(canRead(offersSchema, 'admin', offerForDriverA, DISPATCHER)).toBe(true)
    expect(canRead(offersSchema, 'admin', offerForDriverA, DRIVER_B)).toBe(true)
  })

  it('refuses to let a driver mint an offer', () => {
    expect(canCreate(offersSchema, 'member')).toBe(false)
    expect(canCreate(offersSchema, 'admin')).toBe(true)
  })

  it('shows nothing to anonymous or unlisted roles', () => {
    expect(canRead(offersSchema, '*', offerForDriverA, 'anon_123')).toBe(false)
    expect(canRead(offersSchema, 'viewer', offerForDriverA, DISPATCHER)).toBe(false)
    expect(canCreate(offersSchema, '*')).toBe(false)
  })

  it('treats a stale ownership value as no access', () => {
    // A record whose driverId is an empty/unknown id must not fall through
    // to "allow" for a caller with no id.
    const orphan = { ...offerForDriverA, data: { ...offerForDriverA.data, driverId: '' } }
    expect(canRead(offersSchema, 'member', orphan, DRIVER_A)).toBe(false)
    expect(canRead(offersSchema, 'member', orphan, '')).toBe(false)
  })
})

/**
 * Reviewer access: a reviewer who signs in gets `member`. They must see a
 * populated console, must not be able to change it, and must still never
 * see anyone's offer.
 */
import {
  driversSchema,
  requestsSchema,
  faresSchema,
  fareHistorySchema,
} from '../schemas/dispatch-schema'

describe('reviewer (member) access', () => {
  const rec = (createdBy = DISPATCHER) => ({ recordId: 'r1', createdBy, data: {} })
  const consoleSchemas = [driversSchema, requestsSchema, faresSchema, fareHistorySchema]

  it('can read every console collection', () => {
    for (const s of consoleSchemas) {
      expect(canRead(s, 'member', rec(), 'user_reviewer')).toBe(true)
    }
  })

  it('cannot create, change or delete console data', () => {
    for (const s of consoleSchemas) {
      expect(canCreate(s, 'member')).toBe(false)
      expect(canUpdate(s, 'member', rec(), 'user_reviewer')).toBe(false)
    }
  })

  it('sees nothing when signed out', () => {
    for (const s of consoleSchemas) {
      expect(canRead(s, '*', rec(), 'anon')).toBe(false)
    }
  })

  it('still cannot see a driver’s offer', () => {
    expect(canRead(offersSchema, 'member', offerForDriverA, 'user_reviewer')).toBe(false)
  })

  it('lets the dispatcher write all console data', () => {
    for (const s of consoleSchemas) {
      expect(canCreate(s, 'admin')).toBe(true)
      expect(canUpdate(s, 'admin', rec(), DISPATCHER)).toBe(true)
    }
  })
})

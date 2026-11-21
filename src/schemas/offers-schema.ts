/**
 * Offers — one row per driver the dispatcher offered a job to.
 *
 * `ownerField: 'driverId'` is what makes `read: 'own'` mean "this driver".
 * The value must be the driver's **user id**, not a display id, because
 * DeepSpace resolves ownership as `record.data[ownerField] === userId`
 * (see `isOwner` in the SDK). The driver's name/handle lives on `drivers`,
 * keyed by the same user id.
 *
 * Consequence worth keeping: offers are invisible to every other driver at
 * the Durable Object, before the broadcast — not filtered in the browser.
 */

import type { CollectionSchema } from 'deepspace/schema'

export const offersSchema: CollectionSchema = {
  name: 'offers',
  ownerField: 'driverId',
  columns: [
    { name: 'driverId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'requestId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'fareCents', storage: 'number', interpretation: 'plain' },
    { name: 'etaMin', storage: 'number', interpretation: 'plain' },
    { name: 'reason', storage: 'text', interpretation: 'plain', maxLength: 240 },
    { name: 'status', storage: 'text', interpretation: 'plain', maxLength: 24 },
  ],
  permissions: {
    // Nobody signed out, and no role we don't name, sees an offer.
    '*': { read: false, create: false, update: false, delete: false },
    viewer: { read: false, create: false, update: false, delete: false },
    // A driver sees and answers only their own offers.
    member: { read: 'own', create: false, update: 'own', delete: false },
    // Dispatchers create offers and can read across the fleet.
    admin: { read: true, create: true, update: true, delete: true },
  },
}

/**
 * Offers - one row per driver a dispatcher sent a job to.
 *
 * `ownerField: 'driverId'` is what makes `read: 'own'` mean "this driver".
 * The value must be the driver's **user id**, because DeepSpace resolves
 * ownership as `record.data[ownerField] === userId` (see `isOwner` in the SDK).
 * The driver's display name lives on `drivers`, keyed by the same user id.
 *
 * A driver (`viewer`) never reads requests, so everything a driver needs to
 * decide is copied onto the offer: pickup, drop-off, distance, ETA and price.
 *
 * Consequence worth keeping: offers are invisible to every other driver at the
 * Durable Object, before the broadcast, not filtered in the browser.
 *
 * Writes happen only through server actions (send-offer, respond-offer,
 * simulate-reply), which check who is calling. A driver cannot edit an offer
 * directly, so they cannot change the price on their own job.
 */

import type { CollectionSchema } from 'deepspace/schema'

export const offersSchema: CollectionSchema = {
  name: 'offers',
  ownerField: 'driverId',
  columns: [
    { name: 'driverId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'requestId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'dispatcherId', storage: 'text', interpretation: 'plain' },
    { name: 'origin', storage: 'text', interpretation: 'plain', maxLength: 80 },
    { name: 'destination', storage: 'text', interpretation: 'plain', maxLength: 80 },
    { name: 'distanceKm', storage: 'number', interpretation: 'plain' },
    { name: 'fareCents', storage: 'number', interpretation: 'plain' },
    { name: 'etaMin', storage: 'number', interpretation: 'plain' },
    { name: 'reason', storage: 'text', interpretation: 'plain', maxLength: 240 },
    { name: 'status', storage: 'text', interpretation: 'plain', maxLength: 24 },
    /** 1 when the driver and/or dispatcher on this job are simulated. */
    { name: 'simulated', storage: 'number', interpretation: 'plain' },
  ],
  permissions: {
    // Nobody signed out, and no role we don't name, sees an offer.
    '*': { read: false, create: false, update: false, delete: false },
    // A driver sees only their own offers, and cannot edit them directly.
    viewer: { read: 'own', create: false, update: false, delete: false },
    // A dispatcher sees every offer; writes go through server actions.
    member: { read: true, create: false, update: false, delete: false },
    admin: { read: true, create: true, update: true, delete: true },
  },
}

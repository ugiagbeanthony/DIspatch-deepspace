/**
 * Dispatch console collections.
 *
 * Access model (see PROJECT-STATE.md, "Reviewer access"):
 *   - Anyone signed in (`member`) can READ the console data, so a reviewer
 *     with their own account sees a populated console, not an empty one.
 *   - Only `admin` (the dispatcher) can WRITE any of it.
 *   - `offers` is the exception and stays private per driver — see
 *     offers-schema.ts. Console visibility never extends to offers.
 *
 * Rows seeded by the synthetic-history generator carry `synthetic = 1` so
 * they can be labelled in the UI and told apart from real activity.
 */

import type { CollectionSchema } from 'deepspace/schema'

const readAll = {
  '*': { read: false, create: false, update: false, delete: false },
  viewer: { read: false, create: false, update: false, delete: false },
  member: { read: true, create: false, update: false, delete: false },
  admin: { read: true, create: true, update: true, delete: true },
}

/** Display names live here, keyed by the driver's user id (== offers.driverId). */
export const driversSchema: CollectionSchema = {
  name: 'drivers',
  columns: [
    { name: 'userId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'name', storage: 'text', interpretation: 'plain', maxLength: 80 },
    { name: 'lat', storage: 'number', interpretation: 'plain' },
    { name: 'lng', storage: 'number', interpretation: 'plain' },
    { name: 'rating', storage: 'number', interpretation: 'plain' },
    { name: 'status', storage: 'text', interpretation: 'plain', maxLength: 24 },
    { name: 'synthetic', storage: 'number', interpretation: 'plain' },
  ],
  permissions: readAll,
}

export const requestsSchema: CollectionSchema = {
  name: 'requests',
  columns: [
    { name: 'origin', storage: 'text', interpretation: 'plain', maxLength: 80 },
    { name: 'destination', storage: 'text', interpretation: 'plain', maxLength: 80 },
    { name: 'originLat', storage: 'number', interpretation: 'plain' },
    { name: 'originLng', storage: 'number', interpretation: 'plain' },
    { name: 'status', storage: 'text', interpretation: 'plain', maxLength: 24 },
    { name: 'weather', storage: 'text', interpretation: 'plain', maxLength: 24 },
    { name: 'synthetic', storage: 'number', interpretation: 'plain' },
  ],
  permissions: readAll,
}

/**
 * One fare per request. `factors` is JSON text: [{name, cents, why}].
 * `modelTotalCents` is the SUM OF FACTORS computed in code — never a number
 * the model supplied. `finalCents` is what the dispatcher actually charged
 * (equal to modelTotalCents unless overridden).
 */
export const faresSchema: CollectionSchema = {
  name: 'fares',
  columns: [
    { name: 'requestId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'factors', storage: 'text', interpretation: 'plain', maxLength: 4000 },
    { name: 'modelTotalCents', storage: 'number', interpretation: 'plain' },
    { name: 'finalCents', storage: 'number', interpretation: 'plain' },
    { name: 'overridden', storage: 'number', interpretation: 'plain' },
    { name: 'overrideReason', storage: 'text', interpretation: 'plain', maxLength: 240 },
    { name: 'rejections', storage: 'number', interpretation: 'plain' },
    { name: 'synthetic', storage: 'number', interpretation: 'plain' },
  ],
  permissions: readAll,
}

/** ~14 days of generated clears: the ground truth pricing is judged against. */
export const fareHistorySchema: CollectionSchema = {
  name: 'fareHistory',
  columns: [
    { name: 'origin', storage: 'text', interpretation: 'plain', maxLength: 80 },
    { name: 'destination', storage: 'text', interpretation: 'plain', maxLength: 80 },
    { name: 'hour', storage: 'number', interpretation: 'plain' },
    { name: 'weather', storage: 'text', interpretation: 'plain', maxLength: 24 },
    { name: 'clearedCents', storage: 'number', interpretation: 'plain' },
    { name: 'synthetic', storage: 'number', interpretation: 'plain' },
  ],
  permissions: readAll,
}

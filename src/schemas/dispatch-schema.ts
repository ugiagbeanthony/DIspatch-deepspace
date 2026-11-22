/**
 * Dispatch console collections.
 *
 * Who is who (DeepSpace has three roles, so we map onto them):
 *   admin  = the app owner. Seeds demo data, manages roles.
 *   member = a DISPATCHER. Anyone who signs in lands here by default, so a
 *            reviewer can use the console. Reads everything; creates and
 *            updates requests; adjusts fares.
 *   viewer = a DRIVER. Sees nothing in the console: no requests, no fleet, no
 *            fares. A driver only ever sees offers addressed to them
 *            (offers-schema.ts) and their own notifications.
 *
 * Offers and notifications are written only by server actions, which check the
 * caller's role by hand (actions bypass per-record RBAC; see action-routes.ts).
 *
 * Rows made by the synthetic-history generator carry `synthetic = 1`.
 */

import type { CollectionSchema } from 'deepspace/schema'

const none = { read: false, create: false, update: false, delete: false }

/** Dispatchers read; only the owner writes (fleet, history). */
const dispatcherReadOnly = {
  '*': none,
  viewer: none,
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
  permissions: dispatcherReadOnly,
}

/** Ride requests. Dispatchers add them (a phoned-in request) and update status. */
export const requestsSchema: CollectionSchema = {
  name: 'requests',
  columns: [
    { name: 'origin', storage: 'text', interpretation: 'plain', maxLength: 80 },
    { name: 'destination', storage: 'text', interpretation: 'plain', maxLength: 80 },
    { name: 'originLat', storage: 'number', interpretation: 'plain' },
    { name: 'originLng', storage: 'number', interpretation: 'plain' },
    { name: 'hour', storage: 'number', interpretation: 'plain' },
    { name: 'status', storage: 'text', interpretation: 'plain', maxLength: 24 },
    { name: 'weather', storage: 'text', interpretation: 'plain', maxLength: 24 },
    { name: 'synthetic', storage: 'number', interpretation: 'plain' },
  ],
  permissions: {
    '*': none,
    viewer: none,
    member: { read: true, create: true, update: true, delete: false },
    admin: { read: true, create: true, update: true, delete: true },
  },
}

/**
 * One fare per request. `factors` is JSON text: [{name, cents, why}].
 * `modelTotalCents` is the SUM OF FACTORS computed in code, never a number the
 * model supplied. `finalCents` is what the dispatcher settled on (equal to
 * modelTotalCents unless adjusted). The pricing action creates the row;
 * dispatchers may update it to adjust the price.
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
    { name: 'rejectionNotes', storage: 'text', interpretation: 'plain', maxLength: 600 },
    /** 'model' when the model's factors passed every check, else 'fallback'. */
    { name: 'source', storage: 'text', interpretation: 'plain', maxLength: 16 },
    /** Noise-free fare from the generator's hidden rules. Exists only because
     *  the demo world is synthetic; it lets us measure model bias honestly. */
    { name: 'referenceCents', storage: 'number', interpretation: 'plain' },
    { name: 'synthetic', storage: 'number', interpretation: 'plain' },
  ],
  permissions: {
    '*': none,
    viewer: none,
    member: { read: true, create: false, update: true, delete: false },
    admin: { read: true, create: true, update: true, delete: true },
  },
}

/** ~14 days of generated clears: the ground truth pricing is judged against. */
export const fareHistorySchema: CollectionSchema = {
  name: 'fareHistory',
  columns: [
    { name: 'origin', storage: 'text', interpretation: 'plain', maxLength: 80 },
    { name: 'destination', storage: 'text', interpretation: 'plain', maxLength: 80 },
    { name: 'hour', storage: 'number', interpretation: 'plain' },
    { name: 'weather', storage: 'text', interpretation: 'plain', maxLength: 24 },
    { name: 'day', storage: 'number', interpretation: 'plain' },
    { name: 'clearedCents', storage: 'number', interpretation: 'plain' },
    { name: 'synthetic', storage: 'number', interpretation: 'plain' },
  ],
  permissions: dispatcherReadOnly,
}

/**
 * In-app notifications. `userId` is the RECIPIENT (the owner field), so each
 * person reads only their own. Rows are created by server actions, never by a
 * client; a recipient may update their own (to mark one read).
 */
export const notificationsSchema: CollectionSchema = {
  name: 'notifications',
  ownerField: 'userId',
  columns: [
    { name: 'userId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'kind', storage: 'text', interpretation: 'plain', maxLength: 32 },
    { name: 'title', storage: 'text', interpretation: 'plain', maxLength: 120 },
    { name: 'body', storage: 'text', interpretation: 'plain', maxLength: 300 },
    { name: 'read', storage: 'number', interpretation: 'plain' },
  ],
  permissions: {
    '*': none,
    viewer: { read: 'own', create: false, update: 'own', delete: false },
    member: { read: 'own', create: false, update: 'own', delete: false },
    admin: { read: true, create: true, update: true, delete: true },
  },
}

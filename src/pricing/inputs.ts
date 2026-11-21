/**
 * Parsers for what the record tools hand back to a job, written against the
 * SDK's real response shapes (verified in deepspace/dist/worker.js):
 *
 *   records.get   -> data: { record: { recordId, data: {...}, ... } }
 *   records.query -> data: { records: [ { recordId, data: {...}, ... } ], count }
 *
 * They validate before anything is spent: a malformed read must fail the job
 * loudly, before a model call is paid for, not become "undefined to undefined".
 */

import type { PriceRequestInput } from './reconcile'

export interface HistoryRow {
  origin: string
  destination: string
  hour: number
  weather: string
  clearedCents: number
}

export const MIN_HISTORY_ROWS = 30

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object'

export function requestFromGet(got: unknown): PriceRequestInput & { synthetic?: number } {
  const rec = isObj(got) ? got.record : undefined
  const data = isObj(rec) ? rec.data : undefined
  if (!isObj(data)) throw new Error('price: request record has no data')
  const { origin, destination, hour, weather } = data
  if (typeof origin !== 'string' || origin === '') throw new Error('price: request has no origin')
  if (typeof destination !== 'string' || destination === '') throw new Error('price: request has no destination')
  if (typeof hour !== 'number' || !Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new Error('price: request hour must be an integer 0-23')
  }
  return {
    origin,
    destination,
    hour,
    weather: typeof weather === 'string' && weather ? weather : 'clear',
    synthetic: typeof data.synthetic === 'number' ? data.synthetic : undefined,
  }
}

export function historyFromQuery(got: unknown): HistoryRow[] {
  const records = isObj(got) ? got.records : undefined
  if (!Array.isArray(records)) throw new Error('price: fare history query returned no records array')
  const rows: HistoryRow[] = []
  for (const rec of records) {
    const d = isObj(rec) ? rec.data : undefined
    if (!isObj(d)) continue
    if (
      typeof d.origin === 'string' &&
      typeof d.destination === 'string' &&
      typeof d.hour === 'number' &&
      typeof d.weather === 'string' &&
      typeof d.clearedCents === 'number' &&
      Number.isFinite(d.clearedCents)
    ) {
      rows.push({
        origin: d.origin,
        destination: d.destination,
        hour: d.hour,
        weather: d.weather,
        clearedCents: d.clearedCents,
      })
    }
  }
  if (rows.length < MIN_HISTORY_ROWS) {
    throw new Error(
      `price: only ${rows.length} usable fare-history rows (need ${MIN_HISTORY_ROWS}); seed demo data first`,
    )
  }
  return rows
}

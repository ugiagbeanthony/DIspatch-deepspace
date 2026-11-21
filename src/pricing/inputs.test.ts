import { describe, expect, it } from 'vitest'
import { generateHistory, generateRequests } from '../seed/generate'
import { MIN_HISTORY_ROWS, historyFromQuery, requestFromGet } from './inputs'

// The exact envelopes the SDK returns, so a wrong-depth read can't come back.
const asGet = (data: object) => ({ record: { recordId: 'seed-req-1', data, createdBy: 'u', createdAt: 1, updatedAt: 1 } })
const asQuery = (rows: Array<{ recordId: string; data: object }>) => ({ records: rows, count: rows.length, offset: 0 })

describe('requestFromGet', () => {
  it('reads a request out of the records.get envelope', () => {
    const r = requestFromGet(asGet(generateRequests()[1].data))
    expect(r).toMatchObject({ origin: 'University', destination: 'Midtown', hour: 18, weather: 'rain' })
  })

  it('the old, wrong-depth read is rejected loudly instead of yielding undefined', () => {
    // This is the shape that produced "Unknown zone: undefined" in production.
    expect(() => requestFromGet(generateRequests()[0])).toThrow(/no data/)
  })

  it('rejects missing or invalid fields before any model call', () => {
    expect(() => requestFromGet(asGet({ destination: 'Airport', hour: 8 }))).toThrow(/origin/)
    expect(() => requestFromGet(asGet({ origin: 'Downtown', hour: 8 }))).toThrow(/destination/)
    expect(() => requestFromGet(asGet({ origin: 'A', destination: 'B', hour: 99 }))).toThrow(/hour/)
    expect(() => requestFromGet(undefined)).toThrow()
  })
})

describe('historyFromQuery', () => {
  it('reads all seeded rows out of the records.query envelope', () => {
    const rows = generateHistory().map((h) => ({ recordId: h.recordId, data: h.data }))
    expect(historyFromQuery(asQuery(rows))).toHaveLength(rows.length)
  })

  it('refuses a thin or empty history rather than pricing from nothing', () => {
    expect(() => historyFromQuery(asQuery([]))).toThrow(/seed demo data first/)
    const few = generateHistory().slice(0, MIN_HISTORY_ROWS - 1).map((h) => ({ recordId: h.recordId, data: h.data }))
    expect(() => historyFromQuery(asQuery(few))).toThrow(/only \d+ usable/)
  })

  it('skips malformed rows and rejects a non-envelope', () => {
    expect(() => historyFromQuery({})).toThrow(/no records array/)
    const rows = generateHistory().map((h) => ({ recordId: h.recordId, data: h.data }))
    rows.push({ recordId: 'bad', data: { origin: 'Harbor' } as never })
    expect(historyFromQuery(asQuery(rows))).toHaveLength(rows.length - 1)
  })
})

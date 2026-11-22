import { describe, expect, it } from 'vitest'
import { recent } from './recent'

interface Item {
  id: string
  t: number
  open?: boolean
}
const when = (x: Item) => x.t
const ids = (xs: Item[]) => xs.map((x) => x.id)

const items: Item[] = [
  { id: 'a', t: 1 },
  { id: 'b', t: 5 },
  { id: 'c', t: 3 },
  { id: 'd', t: 4 },
  { id: 'e', t: 2 },
]

describe('recent', () => {
  it('shows the newest few, newest first, and counts the rest', () => {
    const r = recent(items, { when, limit: 3 })
    expect(ids(r.shown)).toEqual(['b', 'd', 'c'])
    expect(r.more).toBe(2)
    expect(ids(r.sorted)).toEqual(['b', 'd', 'c', 'e', 'a'])
  })

  it('shows everything when there are no more than the limit', () => {
    const r = recent(items.slice(0, 2), { when, limit: 3 })
    expect(r.shown).toHaveLength(2)
    expect(r.more).toBe(0)
  })

  it('always shows an item that needs attention, even an old one', () => {
    const withOld = items.map((x) => (x.id === 'a' ? { ...x, open: true } : x))
    const r = recent(withOld, { when, limit: 3, keep: (x) => !!x.open })
    expect(ids(r.shown)).toEqual(['b', 'd', 'a'])
    expect(r.more).toBe(2)
  })

  it('never pushes a kept item out, even if there are more of them than the limit', () => {
    const allOpen = items.map((x) => ({ ...x, open: true }))
    const r = recent(allOpen, { when, limit: 3, keep: (x) => !!x.open })
    expect(r.shown).toHaveLength(5)
    expect(r.more).toBe(0)
  })

  it('keeps a stable order for ties and copes with an empty list', () => {
    const tied: Item[] = [
      { id: 'x', t: 1 },
      { id: 'y', t: 1 },
      { id: 'z', t: 1 },
    ]
    expect(ids(recent(tied, { when, limit: 2 }).shown)).toEqual(['x', 'y'])
    expect(recent([], { when, limit: 3 })).toEqual({ sorted: [], shown: [], more: 0 })
  })
})

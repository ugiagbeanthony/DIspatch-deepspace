/**
 * Show the most recent few of a list that can keep growing, and let the person
 * expand the rest.
 *
 * Anything still needing attention (`keep`) is always shown, however old, so a
 * waiting job can never be pushed out of view by newer, finished ones. `limit`
 * counts those items too: with a limit of 3 and two items to keep, only one
 * other (the newest) is shown.
 */

export interface Recent<T> {
  /** Everything, newest first. */
  sorted: T[]
  /** The preview: items to keep, plus the newest others, in newest-first order. */
  shown: T[]
  /** How many are not in the preview. */
  more: number
}

export function recent<T>(
  items: T[],
  opts: { when: (item: T) => number; limit: number; keep?: (item: T) => boolean },
): Recent<T> {
  const { when, limit, keep } = opts
  // Newest first; the original order breaks ties so the result is stable.
  const sorted = items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => when(b.item) - when(a.item) || a.i - b.i)
    .map((x) => x.item)

  const kept = keep ? sorted.filter(keep) : []
  const room = Math.max(0, limit - kept.length)
  const chosen = new Set<T>(kept)
  for (const item of sorted) {
    if (chosen.size >= kept.length + room) break
    chosen.add(item)
  }
  const shown = sorted.filter((item) => chosen.has(item))
  return { sorted, shown, more: sorted.length - shown.length }
}

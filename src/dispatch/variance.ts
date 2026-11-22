/**
 * Price-adjustment checks and variance statistics. PURE.
 *
 * "Variance" here means: how far the dispatcher's final price sits from the
 * model's suggestion, and (because the demo world is synthetic) how far the
 * model's suggestion sits from the hidden reference price. Every number is
 * computed from stored fare rows, so a delta in the chart can be traced back to
 * the row it came from.
 */

export interface FareRow {
  /** The request this fare is for (for tracing a bar back to its card). */
  requestId: string
  label: string
  weather: string
  suggestedCents: number
  finalCents: number
  referenceCents?: number
  /** What the customer proposed when they called. */
  proposedCents?: number
  overridden: boolean
}

export interface VarianceRow extends FareRow {
  deltaCents: number
  /** (final - suggested) / suggested, in percent. */
  deltaPct: number
  /** (suggested - reference) / reference, in percent; undefined with no reference. */
  modelBiasPct?: number
  /** (agreed - proposed) / proposed, in percent; undefined with no customer price. */
  finalVsProposedPct?: number
  /** (AI - proposed) / proposed, in percent. */
  aiVsProposedPct?: number
}

export interface Bias {
  count: number
  meanPct: number
}

export interface VarianceSummary {
  rows: VarianceRow[]
  overriddenCount: number
  /** Mean of |delta %| over every fare. */
  meanAbsDeltaPct: number
  /** Mean signed delta % over every fare (are dispatchers charging more or less?). */
  meanDeltaPct: number
  /** Model vs hidden reference, overall and by weather. */
  modelBias: { all: Bias | null; byWeather: Record<string, Bias> }
  /** Mean % the agreed price sits above/below what customers proposed. */
  meanFinalVsProposedPct: number | null
  /** Mean % the AI's suggestion sits above/below what customers proposed. */
  meanAiVsProposedPct: number | null
}

const pct = (n: number, of: number) => (of === 0 ? 0 : (n / of) * 100)
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

function meanOrNull(xs: Array<number | undefined>): number | null {
  const v = xs.filter((x): x is number => x !== undefined)
  return v.length ? mean(v) : null
}

function biasOf(values: number[]): Bias | null {
  return values.length ? { count: values.length, meanPct: mean(values) } : null
}

export function summarize(fares: FareRow[]): VarianceSummary {
  const rows: VarianceRow[] = fares.map((f) => ({
    ...f,
    deltaCents: f.finalCents - f.suggestedCents,
    deltaPct: pct(f.finalCents - f.suggestedCents, f.suggestedCents),
    modelBiasPct:
      f.referenceCents && f.referenceCents > 0
        ? pct(f.suggestedCents - f.referenceCents, f.referenceCents)
        : undefined,
    finalVsProposedPct:
      f.proposedCents && f.proposedCents > 0 ? pct(f.finalCents - f.proposedCents, f.proposedCents) : undefined,
    aiVsProposedPct:
      f.proposedCents && f.proposedCents > 0 ? pct(f.suggestedCents - f.proposedCents, f.proposedCents) : undefined,
  }))

  const withBias = rows.filter((r) => r.modelBiasPct !== undefined)
  const byWeather: Record<string, Bias> = {}
  for (const w of new Set(withBias.map((r) => r.weather))) {
    const b = biasOf(withBias.filter((r) => r.weather === w).map((r) => r.modelBiasPct as number))
    if (b) byWeather[w] = b
  }

  return {
    rows,
    overriddenCount: rows.filter((r) => r.overridden).length,
    meanAbsDeltaPct: rows.length ? mean(rows.map((r) => Math.abs(r.deltaPct))) : 0,
    meanDeltaPct: rows.length ? mean(rows.map((r) => r.deltaPct)) : 0,
    modelBias: { all: biasOf(withBias.map((r) => r.modelBiasPct as number)), byWeather },
    meanFinalVsProposedPct: meanOrNull(rows.map((r) => r.finalVsProposedPct)),
    meanAiVsProposedPct: meanOrNull(rows.map((r) => r.aiVsProposedPct)),
  }
}

export interface Adjustment {
  finalCents: number
  overridden: boolean
  overrideReason: string
}

/** Validate a dispatcher's typed price ("12.50") and reason. Returns an error string or the adjustment. */
export function validateAdjustment(
  suggestedCents: number,
  dollarsText: string,
  reason: string,
): { error: string } | { value: Adjustment } {
  const text = dollarsText.trim().replace(/^\$/, '')
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return { error: 'Enter a price like 12.50' }
  const finalCents = Math.round(Number(text) * 100)
  if (finalCents <= 0) return { error: 'Price must be more than zero' }
  if (finalCents > suggestedCents * 10) return { error: 'That is more than 10 times the suggestion' }
  if (finalCents === suggestedCents) {
    return { value: { finalCents, overridden: false, overrideReason: '' } }
  }
  const why = reason.trim()
  if (why === '') return { error: 'Say why you changed the price' }
  return { value: { finalCents, overridden: true, overrideReason: why.slice(0, 240) } }
}

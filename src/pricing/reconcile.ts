/**
 * Fare pricing core. PURE - no I/O. The model is injected, so every rule here
 * is testable with a fake model that lies.
 *
 * The rule this file exists to enforce (PROJECT-STATE.md, decision 4):
 *
 *   THE MODEL NEVER PRODUCES THE FARE TOTAL.
 *
 * The model returns a factor breakdown ({name, cents, why} rows). CODE sums
 * the rows; that sum is the total. We also ask the model to state its own
 * total, but only as a tripwire: if what it claims differs from what its rows
 * add up to, its arithmetic is wrong, the answer is rejected, and we retry
 * once. A second failure falls back to a deterministic price built from the
 * historical digest, flagged `fallback`. Every rejection is recorded.
 */

import type { Digest } from '../seed/generate'

export interface Factor {
  name: string
  cents: number
  why: string
}

export interface Bounds {
  floor: number
  ceiling: number
}

export interface PriceRequestInput {
  origin: string
  destination: string
  hour: number
  weather: string
}

export interface Rejection {
  attempt: number
  reason: string
}

export interface PriceResult {
  factors: Factor[]
  /** Always the sum of `factors`, computed here, never read from the model. */
  totalCents: number
  source: 'model' | 'fallback'
  rejections: Rejection[]
  bounds: Bounds
}

/** The model's raw answer, once parsed but before it is trusted. */
export interface ParsedModelOutput {
  factors: unknown
  claimedTotalCents: unknown
}

export type Verdict =
  | { ok: true; factors: Factor[]; totalCents: number }
  | { ok: false; reason: string }

export const MIN_FACTORS = 2
export const MAX_FACTORS = 8

export function sumFactors(factors: ReadonlyArray<Pick<Factor, 'cents'>>): number {
  return factors.reduce((n, f) => n + f.cents, 0)
}

/** Throws unless the rows add up to the stated total. Used on write. */
export function assertReconciles(factors: ReadonlyArray<Pick<Factor, 'cents'>>, totalCents: number): void {
  const sum = sumFactors(factors)
  if (sum !== totalCents) {
    throw new Error(`Fare does not reconcile: factors sum to ${sum} but total is ${totalCents}`)
  }
}

/** Pull the first JSON object out of model text (tolerates ``` fences / chatter). */
export function parseModelOutput(text: string): ParsedModelOutput | { error: string } {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) return { error: 'no JSON object in response' }
  let raw: unknown
  try {
    raw = JSON.parse(text.slice(start, end + 1))
  } catch {
    return { error: 'response is not valid JSON' }
  }
  if (!raw || typeof raw !== 'object') return { error: 'JSON is not an object' }
  const o = raw as Record<string, unknown>
  return { factors: o.factors, claimedTotalCents: o.claimedTotalCents }
}

/** Decide whether to trust a parsed answer. Never trusts model arithmetic. */
export function validate(parsed: ParsedModelOutput, bounds: Bounds): Verdict {
  if (!Array.isArray(parsed.factors)) return { ok: false, reason: 'factors is not an array' }
  const rows = parsed.factors
  if (rows.length < MIN_FACTORS || rows.length > MAX_FACTORS) {
    return { ok: false, reason: `expected ${MIN_FACTORS}-${MAX_FACTORS} factors, got ${rows.length}` }
  }
  const factors: Factor[] = []
  for (const [i, r] of rows.entries()) {
    const row = r as Record<string, unknown> | null
    if (!row || typeof row !== 'object') return { ok: false, reason: `factor ${i} is not an object` }
    const { name, cents, why } = row
    if (typeof name !== 'string' || name.trim() === '' || name.length > 60) {
      return { ok: false, reason: `factor ${i} has an invalid name` }
    }
    if (typeof why !== 'string' || why.trim() === '' || why.length > 200) {
      return { ok: false, reason: `factor ${i} ("${name}") has no usable explanation` }
    }
    if (typeof cents !== 'number' || !Number.isSafeInteger(cents) || Math.abs(cents) > 100_000) {
      return { ok: false, reason: `factor ${i} ("${name}") cents is not a sane integer` }
    }
    factors.push({ name: name.trim(), cents, why: why.trim() })
  }

  const totalCents = sumFactors(factors)

  const claimed = parsed.claimedTotalCents
  if (typeof claimed !== 'number' || !Number.isFinite(claimed)) {
    return { ok: false, reason: 'model did not state a total to check against' }
  }
  if (claimed !== totalCents) {
    return {
      ok: false,
      reason: `claimed total ${claimed} does not equal factor sum ${totalCents}`,
    }
  }
  if (totalCents < bounds.floor || totalCents > bounds.ceiling) {
    return {
      ok: false,
      reason: `total ${totalCents} outside allowed range ${bounds.floor}-${bounds.ceiling}`,
    }
  }
  return { ok: true, factors, totalCents }
}

// -- digest-derived facts ------------------------------------------------------

/** Typical fare for the route, from history. Falls back to the reverse trip,
 *  then to the median across all routes, when the pair has no rows. */
export function baseMedian(digest: Digest, origin: string, destination: string): number {
  const direct = digest.pairMedianCents[`${origin}>${destination}`]
  if (Number.isFinite(direct)) return direct
  const reverse = digest.pairMedianCents[`${destination}>${origin}`]
  if (Number.isFinite(reverse)) return reverse
  const all = Object.values(digest.pairMedianCents).sort((a, b) => a - b)
  return all.length ? all[Math.floor(all.length / 2)] : 1000
}

export function boundsFor(base: number): Bounds {
  return { floor: Math.round(base * 0.6), ceiling: Math.round(base * 2.2) }
}

/** Deterministic price from the digest alone: the safety net, and the
 *  baseline the model's reasoning is judged against. */
export function fallbackFactors(digest: Digest, req: PriceRequestInput): Factor[] {
  const base = Math.round(baseMedian(digest, req.origin, req.destination))
  const hourMult = digest.hourlyMultiplier[req.hour] ?? 1
  const afterHour = Math.round(base * hourMult)
  const factors: Factor[] = [
    {
      name: 'Typical fare for this route',
      cents: base,
      why: `Median of past clears for ${req.origin} to ${req.destination}.`,
    },
    {
      name: 'Time of day',
      cents: afterHour - base,
      why: `Fares at ${req.hour}:00 run about ${hourMult.toFixed(2)}x the route median in this history.`,
    },
  ]
  if (req.weather === 'rain') {
    const afterRain = Math.round(afterHour * digest.rainMultiplier)
    factors.push({
      name: 'Rain',
      cents: afterRain - afterHour,
      why: `Rain days cleared about ${digest.rainMultiplier.toFixed(2)}x higher in this history.`,
    })
  }
  return factors
}

/** The history-based price for a trip, with no model involved. */
export function estimateCents(digest: Digest, req: PriceRequestInput): number {
  return sumFactors(fallbackFactors(digest, req))
}

export function buildPrompt(req: PriceRequestInput, digest: Digest, feedback?: string): string {
  const base = Math.round(baseMedian(digest, req.origin, req.destination))
  const hourMult = digest.hourlyMultiplier[req.hour] ?? 1
  return [
    'You are the pricing analyst for a small independent ride fleet.',
    'Price ONE ride from the historical facts below. Explain the fare as a short list of factors.',
    '',
    `Request: ${req.origin} to ${req.destination}, pickup hour ${req.hour}:00, weather: ${req.weather}.`,
    `History (${digest.sampleSize} past rides):`,
    `- Median cleared fare for this route: ${base} cents.`,
    `- Typical fare at this hour vs the route median: ${hourMult.toFixed(3)}x.`,
    `- Rain vs clear-weather fares: ${digest.rainMultiplier.toFixed(3)}x.`,
    '',
    'Rules:',
    '- The FIRST factor is the route base fare (the median above).',
    '- Each later factor is a signed whole-number adjustment in cents with a one-sentence reason.',
    '- Use 3 to 5 factors total. Cents are integers, never decimals.',
    '- Also report "claimedTotalCents": the sum of your factors. It will be checked.',
    '',
    'Return ONLY JSON, no prose, in exactly this shape:',
    '{"factors":[{"name":"...","cents":0,"why":"..."}],"claimedTotalCents":0}',
    feedback ? `\nYour previous answer was rejected: ${feedback}. Fix that and answer again.` : '',
  ].join('\n')
}

/** Call the model up to twice, never trusting it, then fall back. */
export async function priceRequest(args: {
  digest: Digest
  request: PriceRequestInput
  callModel: (prompt: string) => Promise<string>
  onReject?: (r: Rejection) => void
}): Promise<PriceResult> {
  const { digest, request, callModel, onReject } = args
  const bounds = boundsFor(baseMedian(digest, request.origin, request.destination))
  const rejections: Rejection[] = []

  let feedback: string | undefined
  for (let attempt = 1; attempt <= 2; attempt++) {
    let verdict: Verdict
    try {
      const text = await callModel(buildPrompt(request, digest, feedback))
      const parsed = parseModelOutput(text)
      verdict = 'error' in parsed ? { ok: false, reason: parsed.error } : validate(parsed, bounds)
    } catch (e) {
      verdict = { ok: false, reason: `model call failed: ${e instanceof Error ? e.message : String(e)}` }
    }
    if (verdict.ok) {
      assertReconciles(verdict.factors, verdict.totalCents)
      return { factors: verdict.factors, totalCents: verdict.totalCents, source: 'model', rejections, bounds }
    }
    const rejection = { attempt, reason: verdict.reason }
    rejections.push(rejection)
    onReject?.(rejection)
    feedback = verdict.reason
  }

  const factors = fallbackFactors(digest, request)
  const totalCents = sumFactors(factors)
  assertReconciles(factors, totalCents)
  return { factors, totalCents, source: 'fallback', rejections, bounds }
}

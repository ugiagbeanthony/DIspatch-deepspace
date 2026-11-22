/**
 * Three prices per request, side by side: what the customer PROPOSED, what the
 * AI SUGGESTED, and what you AGREED. Also the AI against the demo's hidden
 * reference price. Each group is one fare row; click a route to jump to its
 * request. Numbers come from dispatch/variance.ts (tested).
 */

import { useQuery } from 'deepspace'
import { summarize, type FareRow } from '../dispatch/variance'
import { usd } from '../dispatch/offers'

interface RequestData {
  origin: string
  destination: string
  weather: string
  proposedCents?: number
}
interface FareData {
  requestId: string
  modelTotalCents: number
  finalCents: number
  overridden?: number
  referenceCents?: number
}

const signed = (n: number, digits = 1) => `${n > 0 ? '+' : ''}${n.toFixed(digits)}%`

export function VariancePanel() {
  const requests = useQuery<RequestData>('requests')
  const fares = useQuery<FareData>('fares')

  const reqById = new Map(requests.records.map((r) => [r.recordId, r.data]))
  const rows: FareRow[] = fares.records.flatMap((f) => {
    const r = reqById.get(f.data.requestId)
    if (!r) return []
    return [
      {
        requestId: f.data.requestId,
        label: `${r.origin} to ${r.destination}`,
        weather: r.weather,
        suggestedCents: f.data.modelTotalCents,
        finalCents: f.data.finalCents,
        referenceCents: f.data.referenceCents,
        proposedCents: r.proposedCents,
        overridden: f.data.overridden === 1,
      },
    ]
  })

  if (rows.length === 0) {
    return (
      <section data-testid="variance-panel" className="mt-8 rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Proposed vs AI vs agreed</h2>
        <p className="mt-1 text-sm text-muted-foreground">Price a request to see this chart.</p>
      </section>
    )
  }

  const s = summarize(rows)
  const scale = Math.max(1, ...s.rows.flatMap((r) => [r.proposedCents ?? 0, r.suggestedCents, r.finalCents]))
  const rain = s.modelBias.byWeather.rain
  const clear = s.modelBias.byWeather.clear

  const bar = (label: string, cents: number | undefined, cls: string, testId: string) => (
    <div className="flex items-center gap-2">
      <span className="w-32 shrink-0 text-xs text-muted-foreground">{label}</span>
      <div className="h-2 flex-1 rounded bg-muted">
        <div className={`h-2 rounded ${cls}`} style={{ width: `${cents ? (cents / scale) * 100 : 0}%` }} />
      </div>
      <span data-testid={testId} className="w-16 shrink-0 text-right text-xs tabular-nums">
        {cents ? usd(cents) : '\u2014'}
      </span>
    </div>
  )

  return (
    <section data-testid="variance-panel" className="mt-8 rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-semibold">Proposed vs AI vs agreed</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {s.meanAiVsProposedPct === null
          ? 'No customer prices yet, so only the AI and agreed prices are shown.'
          : `On average the AI suggests ${signed(s.meanAiVsProposedPct)} against what customers propose` +
            (s.meanFinalVsProposedPct === null ? '.' : `, and you settle ${signed(s.meanFinalVsProposedPct)} from their proposal.`)}
      </p>

      <ul className="mt-4 space-y-4" aria-label="Customer proposed, AI suggested and agreed price for each request">
        {s.rows.map((r) => (
          <li key={r.requestId} data-testid={`variance-${r.requestId}`} className="text-sm">
            <div className="flex justify-between gap-3">
              <a href={`#request-${r.requestId}`} className="font-medium underline-offset-4 hover:underline">
                {r.label}
              </a>
              <span className="tabular-nums text-muted-foreground">
                agreed vs AI {signed(r.deltaPct)}
                {r.finalVsProposedPct !== undefined && ` · vs proposed ${signed(r.finalVsProposedPct)}`}
              </span>
            </div>
            <div className="mt-1 space-y-1">
              {bar('Customer proposed', r.proposedCents, 'bg-muted-foreground', `bar-proposed-${r.requestId}`)}
              {bar('AI suggests', r.suggestedCents, 'bg-primary', `bar-ai-${r.requestId}`)}
              {bar('Agreed / your price', r.finalCents, 'bg-green-500', `bar-final-${r.requestId}`)}
            </div>
          </li>
        ))}
      </ul>

      {s.modelBias.all && (
        <div className="mt-5 border-t border-border pt-3 text-sm text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">AI vs the demo&apos;s hidden reference price:</span>{' '}
            {signed(s.modelBias.all.meanPct)} on average across {s.modelBias.all.count} fares
            {rain && ` \u00b7 rain ${signed(rain.meanPct)} (${rain.count})`}
            {clear && ` \u00b7 clear ${signed(clear.meanPct)} (${clear.count})`}.
          </p>
          <p className="mt-1">
            The reference exists only because the demo data is synthetic. With few fares these numbers are noisy,
            not a finding.
          </p>
        </div>
      )}
    </section>
  )
}

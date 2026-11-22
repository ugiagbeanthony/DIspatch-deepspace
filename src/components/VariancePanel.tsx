/**
 * Your prices against the AI's suggestions, and the AI's suggestions against
 * the hidden reference price. Every bar is one fare row; click a row to jump to
 * its request. Numbers come from dispatch/variance.ts (tested).
 */

import { useQuery } from 'deepspace'
import { summarize, type FareRow } from '../dispatch/variance'
import { usd } from '../dispatch/offers'

interface RequestData {
  origin: string
  destination: string
  weather: string
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
        overridden: f.data.overridden === 1,
      },
    ]
  })

  if (rows.length === 0) {
    return (
      <section data-testid="variance-panel" className="mt-8 rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Your prices vs the AI</h2>
        <p className="mt-1 text-sm text-muted-foreground">Price a request to see this chart.</p>
      </section>
    )
  }

  const s = summarize(rows)
  const maxAbs = Math.max(5, ...s.rows.map((r) => Math.abs(r.deltaPct)))
  const rain = s.modelBias.byWeather.rain
  const clear = s.modelBias.byWeather.clear

  return (
    <section data-testid="variance-panel" className="mt-8 rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-semibold">Your prices vs the AI</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {s.overriddenCount === 0
          ? 'You have not changed any prices yet, so every bar is zero.'
          : `You changed ${s.overriddenCount} of ${s.rows.length} prices. On average you moved them ${s.meanAbsDeltaPct.toFixed(1)}% (${signed(s.meanDeltaPct)} net).`}
      </p>

      <ul className="mt-4 space-y-2" aria-label="Difference between your price and the AI suggestion, per request">
        {s.rows.map((r) => {
          const w = (Math.abs(r.deltaPct) / maxAbs) * 50
          return (
            <li key={r.requestId} data-testid={`variance-${r.requestId}`} className="text-sm">
              <div className="flex justify-between gap-3">
                <a href={`#request-${r.requestId}`} className="underline-offset-4 hover:underline">
                  {r.label}
                </a>
                <span className="tabular-nums text-muted-foreground">
                  {usd(r.suggestedCents)} → {usd(r.finalCents)} ({signed(r.deltaPct)})
                </span>
              </div>
              {/* Zero-centred bar: right = you charged more, left = less. */}
              <div className="relative mt-1 h-2 rounded bg-muted">
                <div className="absolute left-1/2 top-0 h-2 w-px bg-border" />
                <div
                  className={`absolute top-0 h-2 rounded ${r.deltaPct >= 0 ? 'bg-primary' : 'bg-red-400'}`}
                  style={r.deltaPct >= 0 ? { left: '50%', width: `${w}%` } : { right: '50%', width: `${w}%` }}
                />
              </div>
            </li>
          )
        })}
      </ul>

      {s.modelBias.all && (
        <div className="mt-5 border-t border-border pt-3 text-sm text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">AI vs the demo&apos;s hidden reference price:</span>{' '}
            {signed(s.modelBias.all.meanPct)} on average across {s.modelBias.all.count} fares
            {rain && ` · rain ${signed(rain.meanPct)} (${rain.count})`}
            {clear && ` · clear ${signed(clear.meanPct)} (${clear.count})`}.
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

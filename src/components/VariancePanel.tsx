/**
 * Agreement charts. For every request where a price was AGREED, three prices
 * side by side: what the customer PROPOSED, what the AI SUGGESTED, and what was
 * AGREED. Shows the three most recent; the rest sit behind "Show all".
 *
 * Only agreed deals appear: an unfinished negotiation has no agreed price yet,
 * so charting one would mislabel the AI's own number as an agreement. Also the
 * AI against the demo's hidden reference price. Numbers come from
 * dispatch/variance.ts (tested).
 */

import { useState } from 'react'
import { useMine } from '../lib/use-mine'
import { summarize, type FareRow } from '../dispatch/variance'
import { usd } from '../dispatch/offers'

const RECENT = 3

interface RequestData {
  origin: string
  destination: string
  weather: string
  proposedCents?: number
}
interface FareData {
  requestId: string
  modelTotalCents: number
  referenceCents?: number
}
interface NegotiationData {
  requestId: string
  status: string
  agreedCents: number
}

const signed = (n: number, digits = 1) => `${n > 0 ? '+' : ''}${n.toFixed(digits)}%`
const stamp = (iso: string) => {
  const t = Date.parse(iso)
  return Number.isNaN(t) ? 0 : t
}

export function VariancePanel() {
  // Your own agreements only.
  const requests = useMine<RequestData>('requests')
  const fares = useMine<FareData>('fares')
  const negotiations = useMine<NegotiationData>('negotiations')
  const [showAll, setShowAll] = useState(false)

  const reqById = new Map(requests.records.map((r) => [r.recordId, r.data]))
  const fareByReq = new Map(fares.records.map((f) => [f.data.requestId, f.data]))

  // Agreed deals only, newest first.
  const rows: FareRow[] = negotiations.records
    .filter((n) => n.data.status === 'agreed')
    .sort((a, b) => stamp(b.updatedAt) - stamp(a.updatedAt))
    .flatMap((n) => {
      const r = reqById.get(n.data.requestId)
      const f = fareByReq.get(n.data.requestId)
      if (!r || !f) return []
      return [
        {
          requestId: n.data.requestId,
          label: `${r.origin} to ${r.destination}`,
          weather: r.weather,
          suggestedCents: f.modelTotalCents,
          finalCents: n.data.agreedCents,
          referenceCents: f.referenceCents,
          proposedCents: r.proposedCents,
          overridden: n.data.agreedCents !== f.modelTotalCents,
        },
      ]
    })

  if (rows.length === 0) {
    return (
      <section data-testid="variance-panel" className="mt-8 rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Agreement charts</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Agree a price with a customer to see how it compares with their offer and the AI&apos;s suggestion.
        </p>
      </section>
    )
  }

  const s = summarize(rows)
  const shown = showAll ? s.rows : s.rows.slice(0, RECENT)
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
        {cents ? usd(cents) : '—'}
      </span>
    </div>
  )

  const canExpand = s.rows.length > RECENT
  const toggle = () => canExpand && setShowAll((v) => !v)

  return (
    <section
      data-testid="variance-panel"
      // Click anywhere on the section to see more (or fewer). Links inside keep working.
      role={canExpand ? 'button' : undefined}
      tabIndex={canExpand ? 0 : undefined}
      aria-expanded={canExpand ? showAll : undefined}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('a')) return
        toggle()
      }}
      onKeyDown={(e) => {
        if (canExpand && (e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
          e.preventDefault()
          toggle()
        }
      }}
      className={`mt-8 rounded-lg border border-border bg-card p-4 ${canExpand ? 'cursor-pointer hover:bg-card/80' : ''}`}
    >
      <h2 className="text-sm font-semibold">Agreement charts</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {s.meanAiVsProposedPct === null
          ? `${s.rows.length} agreed ${s.rows.length === 1 ? 'price' : 'prices'}.`
          : `Across ${s.rows.length} agreed ${s.rows.length === 1 ? 'price' : 'prices'}, the AI suggests ${signed(s.meanAiVsProposedPct)} against what customers offer` +
            (s.meanFinalVsProposedPct === null ? '.' : `, and you settle ${signed(s.meanFinalVsProposedPct)} from their offer.`)}
      </p>

      <ul
        data-testid="agreement-list"
        className="mt-4 space-y-4"
        aria-label="Customer offer, AI suggestion and agreed price for each agreement"
      >
        {shown.map((r) => (
          <li key={r.requestId} data-testid={`variance-${r.requestId}`} className="text-sm">
            <div className="flex justify-between gap-3">
              <a href={`#request-${r.requestId}`} className="font-medium underline-offset-4 hover:underline">
                {r.label}
              </a>
              <span className="tabular-nums text-muted-foreground">
                agreed vs AI {signed(r.deltaPct)}
                {r.finalVsProposedPct !== undefined && ` · vs offer ${signed(r.finalVsProposedPct)}`}
              </span>
            </div>
            <div className="mt-1 space-y-1">
              {bar('Customer offered', r.proposedCents, 'bg-muted-foreground', `bar-proposed-${r.requestId}`)}
              {bar('AI suggested', r.suggestedCents, 'bg-primary', `bar-ai-${r.requestId}`)}
              {bar('Agreed', r.finalCents, 'bg-green-500', `bar-final-${r.requestId}`)}
            </div>
          </li>
        ))}
      </ul>

      {canExpand && (
        <p data-testid="agreements-toggle" className="mt-4 text-sm font-medium underline underline-offset-4">
          {showAll ? `Click to show only the latest ${RECENT}` : `Click to show all ${s.rows.length} agreements`}
        </p>
      )}

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

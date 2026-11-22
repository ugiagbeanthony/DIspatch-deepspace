/**
 * Agreement charts. For every request where a price was AGREED: what the
 * customer OFFERED, what the AI SUGGESTED and what was AGREED, side by side.
 *
 * The console shows a PREVIEW of the three most recent; clicking anywhere on it
 * opens the full list on its own page (/agreements). Only agreed deals appear:
 * an unfinished negotiation has no agreed price yet, so charting one would
 * mislabel the AI's own number as an agreement. Only YOUR agreements appear.
 * Numbers come from dispatch/variance.ts (tested).
 */

import { Link } from 'react-router-dom'
import { useMine } from '../lib/use-mine'
import { summarize, type FareRow, type VarianceSummary } from '../dispatch/variance'
import { usd } from '../dispatch/offers'

export const PREVIEW_COUNT = 3

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

/** Your agreed deals, newest first, with their summary. */
export function useAgreements(): { ready: boolean; summary: VarianceSummary } {
  const requests = useMine<RequestData>('requests')
  const fares = useMine<FareData>('fares')
  const negotiations = useMine<NegotiationData>('negotiations')

  const reqById = new Map(requests.records.map((r) => [r.recordId, r.data]))
  const fareByReq = new Map(fares.records.map((f) => [f.data.requestId, f.data]))

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

  return { ready: negotiations.status === 'ready', summary: summarize(rows) }
}

/** One labelled bar. Scaled within its own agreement so one odd number cannot flatten the rest. */
function Bar({ label, cents, scale, cls, testId }: { label: string; cents?: number; scale: number; cls: string; testId: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-32 shrink-0 text-xs text-muted-foreground">{label}</span>
      <div className="h-2 min-w-0 flex-1 rounded bg-muted">
        <div className={`h-2 rounded ${cls}`} style={{ width: `${cents ? Math.min(100, (cents / scale) * 100) : 0}%` }} />
      </div>
      <span data-testid={testId} className="min-w-[4.5rem] shrink-0 whitespace-nowrap text-right text-xs tabular-nums">
        {cents ? usd(cents) : '\u2014'}
      </span>
    </div>
  )
}

export function AgreementRows({ rows }: { rows: VarianceSummary['rows'] }) {
  return (
    <ul
      data-testid="agreement-list"
      className="mt-4 space-y-4"
      aria-label="Customer offer, AI suggestion and agreed price for each agreement"
    >
      {rows.map((r) => {
        const scale = Math.max(1, r.proposedCents ?? 0, r.suggestedCents, r.finalCents)
        return (
          <li key={r.requestId} data-testid={`variance-${r.requestId}`} className="overflow-hidden text-sm">
            <div className="flex flex-wrap justify-between gap-x-3">
              <span className="font-medium">{r.label}</span>
              <span className="tabular-nums text-muted-foreground">
                agreed vs AI {signed(r.deltaPct)}
                {r.finalVsProposedPct !== undefined && ` \u00b7 vs offer ${signed(r.finalVsProposedPct)}`}
              </span>
            </div>
            <div className="mt-1 space-y-1">
              <Bar label="Customer offered" cents={r.proposedCents} scale={scale} cls="bg-muted-foreground" testId={`bar-proposed-${r.requestId}`} />
              <Bar label="AI suggested" cents={r.suggestedCents} scale={scale} cls="bg-primary" testId={`bar-ai-${r.requestId}`} />
              <Bar label="Agreed" cents={r.finalCents} scale={scale} cls="bg-green-500" testId={`bar-final-${r.requestId}`} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

export function SummaryLine({ s }: { s: VarianceSummary }) {
  const n = s.rows.length
  return (
    <p className="mt-1 text-sm text-muted-foreground">
      {s.meanAiVsProposedPct === null
        ? `${n} agreed ${n === 1 ? 'price' : 'prices'}.`
        : `Across ${n} agreed ${n === 1 ? 'price' : 'prices'}, the AI suggests ${signed(s.meanAiVsProposedPct)} against what customers offer` +
          (s.meanFinalVsProposedPct === null ? '.' : `, and you settle ${signed(s.meanFinalVsProposedPct)} from their offer.`)}
    </p>
  )
}

export function ReferenceNote({ s }: { s: VarianceSummary }) {
  const rain = s.modelBias.byWeather.rain
  const clear = s.modelBias.byWeather.clear
  if (!s.modelBias.all) return null
  return (
    <div className="mt-5 border-t border-border pt-3 text-sm text-muted-foreground">
      <p>
        <span className="font-medium text-foreground">AI vs the demo&apos;s hidden reference price:</span>{' '}
        {signed(s.modelBias.all.meanPct)} on average across {s.modelBias.all.count} fares
        {rain && ` \u00b7 rain ${signed(rain.meanPct)} (${rain.count})`}
        {clear && ` \u00b7 clear ${signed(clear.meanPct)} (${clear.count})`}.
      </p>
    </div>
  )
}

/** The console preview: the latest few, and the whole area opens the full page. */
export function VariancePanel() {
  const { summary: s } = useAgreements()

  if (s.rows.length === 0) {
    return (
      <section data-testid="variance-panel" className="mt-8 rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Agreement charts</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Agree a price with a customer to see how it compares with their offer and the AI&apos;s suggestion.
        </p>
      </section>
    )
  }

  return (
    <Link
      to="/agreements"
      data-testid="variance-panel"
      aria-label={`Agreement charts: open all ${s.rows.length} agreements`}
      className="mt-8 block rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted/40"
    >
      <h2 className="text-sm font-semibold">Agreement charts</h2>
      <SummaryLine s={s} />
      <AgreementRows rows={s.rows.slice(0, PREVIEW_COUNT)} />
      <p data-testid="agreements-see-all" className="mt-4 text-sm font-medium underline underline-offset-4">
        {s.rows.length > PREVIEW_COUNT ? `See all ${s.rows.length} agreements \u2192` : 'Open agreement charts \u2192'}
      </p>
    </Link>
  )
}

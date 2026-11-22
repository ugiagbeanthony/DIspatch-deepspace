/**
 * Every agreement you have reached, newest first. The console shows only the
 * latest three and links here. Your own agreements only.
 */

import { Link } from 'react-router-dom'
import { AgreementRows, ReferenceNote, SummaryLine, useAgreements } from '@/components/VariancePanel'

export default function AgreementsPage() {
  const { ready, summary: s } = useAgreements()

  return (
    <div className="mx-auto max-w-4xl px-6 py-12 text-foreground">
      <Link to="/home" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
        &larr; Back to the console
      </Link>
      <h1 className="mt-3 text-3xl font-bold tracking-tight">Agreement charts</h1>

      {ready && s.rows.length === 0 ? (
        <p data-testid="agreements-empty" className="mt-4 text-sm text-muted-foreground">
          No agreements yet. Agree a price with a customer on the console and it will appear here.
        </p>
      ) : (
        <div data-testid="agreements-page" className="mt-2 rounded-lg border border-border bg-card p-4">
          <SummaryLine s={s} />
          <AgreementRows rows={s.rows} />
          <ReferenceNote s={s} />
        </div>
      )}
    </div>
  )
}

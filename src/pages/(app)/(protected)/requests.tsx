/**
 * Every request you have, newest first. The console shows only the latest three
 * and links here. Your own requests only.
 */

import { Link } from 'react-router-dom'
import { PRICING_NOTE, RequestList } from '@/components/RequestsPanel'

export default function RequestsPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-12 text-foreground">
      <Link to="/home" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
        &larr; Back to the console
      </Link>
      <h1 className="mt-3 text-3xl font-bold tracking-tight">All requests</h1>
      <p className="mt-1 text-sm text-muted-foreground">{PRICING_NOTE}</p>
      <RequestList />
    </div>
  )
}

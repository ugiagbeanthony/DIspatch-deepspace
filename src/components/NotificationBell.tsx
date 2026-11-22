/**
 * In-app notifications for both sides: a driver is told about a new job, a
 * dispatcher is told how a driver answered. Rows are created by server actions
 * and addressed to one person (ownerField userId), so you only ever receive
 * your own. A toast pops when a new one arrives while you are on the page.
 */

import { useEffect, useRef, useState } from 'react'
import { useMutations, useQuery, useUser } from 'deepspace'
import { Bell } from 'lucide-react'
import { useToast } from '@/components/ui'

interface NoteData {
  userId: string
  kind: string
  title: string
  body: string
  read?: number
}

export function NotificationBell() {
  const { user } = useUser()
  const notes = useQuery<NoteData>('notifications', { orderBy: 'createdAt', orderDir: 'desc', limit: 20 })
  const { put } = useMutations<Partial<NoteData>>('notifications')
  const { info } = useToast()
  const [open, setOpen] = useState(false)

  const mine = notes.records.filter((n) => n.data.userId === user?.id)
  const unread = mine.filter((n) => n.data.read !== 1)

  // Toast only for notifications that arrive AFTER the first load.
  const seen = useRef<Set<string> | null>(null)
  useEffect(() => {
    if (notes.status !== 'ready') return
    if (seen.current === null) {
      seen.current = new Set(mine.map((n) => n.recordId))
      return
    }
    for (const n of mine) {
      if (!seen.current.has(n.recordId)) {
        seen.current.add(n.recordId)
        if (n.data.read !== 1) info(n.data.title, n.data.body)
      }
    }
  }, [notes.status, mine, info])

  async function markAllRead() {
    await Promise.all(unread.map((n) => put(n.recordId, { read: 1 }).catch(() => undefined)))
  }

  return (
    <div className="relative">
      <button
        data-testid="notification-bell"
        aria-label={`Notifications, ${unread.length} unread`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="relative inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
      >
        <Bell className="h-4 w-4" aria-hidden />
        {unread.length > 0 && (
          <span
            data-testid="notification-count"
            className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] leading-4 text-primary-foreground"
          >
            {unread.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-lg border border-border bg-card p-3 text-sm shadow-lg">
          <div className="flex items-center justify-between">
            <span className="font-semibold">Notifications</span>
            {unread.length > 0 && (
              <button className="text-xs text-muted-foreground hover:text-foreground" onClick={markAllRead}>
                Mark all read
              </button>
            )}
          </div>
          {mine.length === 0 ? (
            <p className="mt-2 text-muted-foreground">Nothing yet.</p>
          ) : (
            <ul className="mt-2 max-h-72 space-y-2 overflow-y-auto">
              {mine.map((n) => (
                <li key={n.recordId} className={n.data.read === 1 ? 'text-muted-foreground' : ''}>
                  <div className="font-medium">{n.data.title}</div>
                  <div className="text-xs">{n.data.body}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

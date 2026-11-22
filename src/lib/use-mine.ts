/**
 * Records that belong to the signed-in person.
 *
 * The permission rules already stop a dispatcher reading anyone else's requests,
 * fares and negotiations. This filter adds two things the rules cannot:
 *  - the OWNER (admin) can read every row, but should see only their own here;
 *  - offers are owned by the DRIVER (that is what makes them private to a
 *    driver), so a dispatcher's view of the jobs they sent is filtered by
 *    `dispatcherId` instead. That one is a screen filter, not enforcement.
 */

import { useQuery, useUser } from 'deepspace'

export function useMine<T>(collection: string, by: 'createdBy' | 'dispatcherId' = 'createdBy') {
  const { user } = useUser()
  const q = useQuery<T>(collection)
  const me = user?.id
  const records = q.records.filter((r) =>
    by === 'createdBy' ? r.createdBy === me : (r.data as { dispatcherId?: string }).dispatcherId === me,
  )
  return { ...q, records }
}

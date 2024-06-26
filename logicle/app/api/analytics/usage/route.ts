import { requireSession } from '@/api/utils/auth'
import ApiResponses from '@/api/utils/ApiResponses'
import { db } from '@/db/database'

export const dynamic = 'force-dynamic'

function formatDate(d) {
  let month = '' + (d.getMonth() + 1)
  let day = '' + d.getDate()
  const year = d.getFullYear()

  if (month.length < 2) month = '0' + month
  if (day.length < 2) day = '0' + day

  return [year, month, day].join('-')
}
export const GET = requireSession(async () => {
  let query = db.selectFrom('MessageAudit')
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  const endOfMonth = new Date(startOfMonth)
  endOfMonth.setMonth(endOfMonth.getMonth() + 1)
  for (let i = 0; i < 12; i++) {
    //const offset = yourDate.getTimezoneOffset()
    //yourDate = new Date(yourDate.getTime() - offset * 60 * 1000)
    const formattedFrom = formatDate(startOfMonth)
    const formattedTo = formatDate(endOfMonth)
    query = query.select((eb) =>
      eb.fn
        .sum('tokens')
        .filterWhere(
          eb.and([
            eb('MessageAudit.sentAt', '>=', formattedFrom),
            eb('MessageAudit.sentAt', '<=', formattedTo),
          ])
        )
        .as(formattedFrom)
    )
    endOfMonth.setTime(startOfMonth.getTime())
    startOfMonth.setMonth(startOfMonth.getMonth() - 1)
  }

  const result = (await query.executeTakeFirst()) as Record<string, number>
  const sorted = Object.entries(result)
    .map((k) => {
      return {
        date: k[0],
        tokens: k[1],
      }
    })
    .toSorted((e1, e2) => (e1.date > e2.date ? 1 : -1))
  return ApiResponses.json(sorted)
})

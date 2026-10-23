import { useLiveReadOptions } from '../../lib/live-query'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { z } from 'zod'
import { useAuth } from '../auth/auth'
import { occurrenceStatusSchema } from '../occurrence/occurrence'
import { PrivateRequestError } from '../../lib/api'

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
export const occurrenceReportSchema = z.object({
  total: count,
  categories: z.array(z.object({ categoryId: z.number().int().positive(), categoryName: z.string().min(1), count })),
  statuses: z.array(z.object({ status: occurrenceStatusSchema, count })),
  localities: z.array(z.object({ locality: z.string().min(1).nullable(), count })),
  averageResolutionSeconds: z.number().nonnegative().nullable(),
  resolvedSampleSize: count,
  resolvedWithoutValidDuration: count,
  rejectedPercentage: z.number().min(0).max(100).nullable(),
  generatedAt: z.iso.datetime(),
}).superRefine((report, context) => {
  const states = ['PENDING', 'IN_ANALYSIS', 'RESOLVED', 'REJECTED']
  const resolved = report.statuses.find(item => item.status === 'RESOLVED')?.count
  if ([report.categories, report.statuses, report.localities].some(items => items.reduce((sum, item) => sum + item.count, 0) !== report.total)
    || report.statuses.map(item => item.status).join() !== states.join()
    || new Set(report.categories.map(item => item.categoryId)).size !== report.categories.length
    || new Set(report.localities.map(item => item.locality)).size !== report.localities.length
    || report.resolvedSampleSize + report.resolvedWithoutValidDuration !== resolved
    || (report.averageResolutionSeconds === null) !== (report.resolvedSampleSize === 0)
    || (report.rejectedPercentage === null) !== (report.total === 0)) {
    context.addIssue({ code: 'custom', message: 'Relatório inconsistente.' })
  }
})
export type OccurrenceReport = z.infer<typeof occurrenceReportSchema>
export const reportKey = (userId: string | null) => ['private', userId, 'occurrence-report'] as const

export function useOccurrenceReport(enabled = true) {
  const { state, request } = useAuth()
  const client = useQueryClient()
  const userId = state.status === 'authenticated' ? state.user.id : null
  const live = useLiveReadOptions(enabled && state.status === 'authenticated' && state.user.role === 'ADMIN', true)
  const query = useQuery({
    queryKey: reportKey(userId), ...live,
    queryFn: async ({ signal }) => {
      return occurrenceReportSchema.parse(await (await request('/api/admin/reports/occurrences', 'GET', signal)).json())
    },

  })
  useEffect(() => {
    if (query.error instanceof PrivateRequestError && query.error.status === 403) {
      void client.cancelQueries({ queryKey: reportKey(userId) })
      client.removeQueries({ queryKey: reportKey(userId) })
    }
  }, [query.error, client, userId])
  return query
}

const readableNumber = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })
export const preciseSeconds = (seconds: number) => `${new Intl.NumberFormat('pt-BR', { maximumSignificantDigits: 12 }).format(seconds)} segundos`
export function resolutionDuration(seconds: number) {
  if (seconds < 60) return preciseSeconds(seconds)
  if (seconds < 3600) return `${readableNumber.format(seconds / 60)} min`
  if (seconds < 86400) return `${readableNumber.format(seconds / 3600)} h`
  return `${readableNumber.format(seconds / 86400)} dias`
}

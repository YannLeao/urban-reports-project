import { useLiveReadOptions } from '../../lib/live-query'
import { emptyFilters, filterKey, filterQuery, type Filters } from './filters'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { publicRequest } from '../../lib/api'
import { publicOccurrencePageSchema, publicOccurrenceSchema } from './public-occurrence'

export const PUBLIC_PAGE_SIZE = 20

export function usePublicOccurrences(page: number, enabled = true, filters: Filters = emptyFilters) {
  const live = useLiveReadOptions(enabled)
  return useQuery({
    queryKey: ['public', 'occurrences', 'list', { page, size: PUBLIC_PAGE_SIZE, ...filterKey(filters) }], ...live,
    queryFn: async ({ signal }) => {
      const response = await publicRequest(`/api/public/occurrences?page=${page}&size=${PUBLIC_PAGE_SIZE}${filterQuery(filters) ? `&${filterQuery(filters)}` : ''}`, signal)
      const payload: unknown = await response.json()
      return publicOccurrencePageSchema.parse(payload)
    },

  })
}

export function usePublicOccurrence(id: string | undefined) {
  return useQuery({
    queryKey: ['public', 'occurrences', 'detail', id],
    queryFn: async ({ signal }) => {
      const occurrenceId = z.uuid().parse(id)
      const response = await publicRequest(`/api/public/occurrences/${occurrenceId}`, signal)
      const payload: unknown = await response.json()
      return publicOccurrenceSchema.parse(payload)
    },
    retry: false,
    refetchOnWindowFocus: false,
  })
}
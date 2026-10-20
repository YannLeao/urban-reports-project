import { emptyFilters, filterKey, filterQuery, type Filters } from './filters'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { useAuth } from '../auth/auth'
import { occurrenceDetailSchema, occurrencesSchema } from './occurrence'

export function useOccurrences(enabled = true, filters: Filters = emptyFilters) {
  const { state, request } = useAuth()
  const userId = state.status === 'authenticated' ? state.user.id : null
  return useQuery({
    queryKey: ['private', userId, 'occurrences', 'list', filterKey(filters)],
    enabled: userId !== null && enabled,
    queryFn: async ({ signal }) => {
      const response = await request(`/api/occurrences${filterQuery(filters) ? `?${filterQuery(filters)}` : ''}`, 'GET', signal)
      const payload: unknown = await response.json()
      return occurrencesSchema.parse(payload)
    },
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}

export function useOccurrence(id: string | undefined) {
  const { state, request } = useAuth()
  const userId = state.status === 'authenticated' ? state.user.id : null
  return useQuery({
    queryKey: ['private', userId, 'occurrences', 'detail', id],
    enabled: userId !== null,
    queryFn: async ({ signal }) => {
      const occurrenceId = z.uuid().parse(id)
      const response = await request(`/api/occurrences/${occurrenceId}`, 'GET', signal)
      const payload: unknown = await response.json()
      return occurrenceDetailSchema.parse(payload)
    },
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}

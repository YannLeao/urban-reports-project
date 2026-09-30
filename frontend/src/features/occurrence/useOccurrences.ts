import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { useAuth } from '../auth/auth'
import { occurrenceSchema, occurrencesSchema } from './occurrence'

export function useOccurrences() {
  const { state, request } = useAuth()
  const userId = state.status === 'authenticated' ? state.user.id : null
  return useQuery({
    queryKey: ['private', userId, 'occurrences'],
    enabled: userId !== null,
    queryFn: async ({ signal }) => {
      const response = await request('/api/occurrences', 'GET', signal)
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
    queryKey: ['private', userId, 'occurrences', id],
    enabled: userId !== null,
    queryFn: async ({ signal }) => {
      const occurrenceId = z.uuid().parse(id)
      const response = await request(`/api/occurrences/${occurrenceId}`, 'GET', signal)
      const payload: unknown = await response.json()
      return occurrenceSchema.parse(payload)
    },
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}

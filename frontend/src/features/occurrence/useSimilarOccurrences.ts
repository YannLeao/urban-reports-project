import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/auth'
import { querySimilar, type SimilarCriteria } from './similar-occurrences'

/** Mount only after explicit review; unmount on criteria change. No persisted location cache. */
export function useSimilarOccurrences(criteria: SimilarCriteria | null, active = true) {
  const { state, request } = useAuth()
  const userId = state.status === 'authenticated' ? state.user.id : null
  const client = useQueryClient()
  const context = JSON.stringify(criteria)
  useEffect(() => {
    if (!active) void client.cancelQueries({ queryKey: ['private', userId, 'similar-occurrences', JSON.parse(context)] })
  }, [active, client, userId, context])
  return useQuery({
    queryKey: ['private', userId, 'similar-occurrences', criteria],
    queryFn: async ({ signal }) => {
      await Promise.resolve()
      if (signal.aborted) throw new DOMException('Consulta cancelada', 'AbortError')
      return querySimilar(request, criteria!, signal)
    },
    enabled: active && !!criteria && !!userId,
    retry: false, gcTime: 0, staleTime: Infinity,
    refetchOnMount: false, refetchOnWindowFocus: false, refetchOnReconnect: false,
  })
}

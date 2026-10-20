import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../auth/auth'
import { querySimilar, type SimilarCriteria } from './similar-occurrences'

/** Mount only after explicit review; unmount on criteria change. No persisted location cache. */
export function useSimilarOccurrences(criteria: SimilarCriteria | null) {
  const { state, request } = useAuth()
  const userId = state.status === 'authenticated' ? state.user.id : null
  return useQuery({
    queryKey: ['private', userId, 'similar-occurrences', criteria],
    queryFn: ({ signal }) => querySimilar(request, criteria!, signal),
    enabled: !!criteria && !!userId,
    retry: false, gcTime: 0, staleTime: Infinity,
    refetchOnMount: false, refetchOnWindowFocus: false, refetchOnReconnect: false,
  })
}

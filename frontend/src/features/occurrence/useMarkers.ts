import { emptyFilters, filterKey, filterQuery, type Filters } from './filters'
import { useQuery } from '@tanstack/react-query'
import { publicRequest } from '../../lib/api'
import { useAuth } from '../auth/auth'
import { markerSetSchema } from './markers'

export function usePublicMarkers(filters: Filters = emptyFilters) {
  return useQuery({
    queryKey: ['public', 'occurrences', 'markers', filterKey(filters)],
    queryFn: async ({ signal }) => {
      const response = await publicRequest(`/api/public/occurrences/markers${filterQuery(filters) ? `?${filterQuery(filters)}` : ''}`, signal)
      const payload: unknown = await response.json()
      return markerSetSchema.parse(payload)
    }, retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false,
  })
}
export function useOwnMarkers(filters: Filters = emptyFilters) {
  const { state, request } = useAuth()
  const userId = state.status === 'authenticated' ? state.user.id : null
  return useQuery({
    queryKey: ['private', userId, 'occurrences', 'markers', filterKey(filters)], enabled: userId !== null,
    queryFn: async ({ signal }) => {
      const response = await request(`/api/occurrences/markers${filterQuery(filters) ? `?${filterQuery(filters)}` : ''}`, 'GET', signal)
      const payload: unknown = await response.json()
      return markerSetSchema.parse(payload)
    }, retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false,
  })
}

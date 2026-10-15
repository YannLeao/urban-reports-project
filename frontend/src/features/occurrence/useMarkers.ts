import { useQuery } from '@tanstack/react-query'
import { publicRequest } from '../../lib/api'
import { useAuth } from '../auth/auth'
import { markerSetSchema } from './markers'

export function usePublicMarkers() {
  return useQuery({
    queryKey: ['public', 'occurrences', 'markers'],
    queryFn: async ({ signal }) => {
      const response = await publicRequest('/api/public/occurrences/markers', signal)
      const payload: unknown = await response.json()
      return markerSetSchema.parse(payload)
    }, retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false,
  })
}
export function useOwnMarkers() {
  const { state, request } = useAuth()
  const userId = state.status === 'authenticated' ? state.user.id : null
  return useQuery({
    queryKey: ['private', userId, 'occurrences', 'markers'], enabled: userId !== null,
    queryFn: async ({ signal }) => {
      const response = await request('/api/occurrences/markers', 'GET', signal)
      const payload: unknown = await response.json()
      return markerSetSchema.parse(payload)
    }, retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false,
  })
}

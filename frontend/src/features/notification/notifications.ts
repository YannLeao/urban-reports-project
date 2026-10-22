import { useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { useAuth } from '../auth/auth'

const notificationSchema = z.object({
  id: z.uuid(),
  occurrenceId: z.uuid(),
  type: z.enum(['STATUS_CHANGED', 'OCCURRENCE_REJECTED']),
  message: z.string().min(1),
  createdAt: z.iso.datetime(),
  readAt: z.iso.datetime().nullable(),
})
const pageSchema = z.object({
  items: z.array(notificationSchema),
  page: z.number().int().nonnegative(),
  size: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
  unreadCount: z.number().int().nonnegative(),
})
export type Notification = z.infer<typeof notificationSchema>

/** Intervalo para atualização automática das notificações (2 minutos). */
export const NOTIFICATIONS_REFETCH_INTERVAL = 120_000

export function useNotifications(page = 0) {
  const { state, request } = useAuth()
  const client = useQueryClient()
  const userId = state.status === 'authenticated' ? state.user.id : null
  const query = useQuery({
    queryKey: ['private', userId, 'notifications', page],
    enabled: userId !== null && state.status === 'authenticated' && state.user.role === 'USER',
    queryFn: async ({ signal }) => pageSchema.parse(await (await request(`/api/notifications?page=${page}&size=20`, 'GET', signal)).json()),
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: NOTIFICATIONS_REFETCH_INTERVAL,
  })
  async function markRead(id: string) {
    z.uuid().parse(id)
    const response = await request(`/api/notifications/${id}/read`, 'POST')
    notificationSchema.parse(await response.json())
    await client.invalidateQueries({ queryKey: ['private', userId, 'notifications'] })
  }
  return { ...query, markRead }
}

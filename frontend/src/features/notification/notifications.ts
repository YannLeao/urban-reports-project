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
})
export type Notification = z.infer<typeof notificationSchema>

export function useNotifications() {
  const { state, request } = useAuth()
  const client = useQueryClient()
  const userId = state.status === 'authenticated' ? state.user.id : null
  const query = useQuery({
    queryKey: ['private', userId, 'notifications'],
    enabled: userId !== null,
    queryFn: async ({ signal }) => pageSchema.parse(await (await request('/api/notifications', 'GET', signal)).json()),
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: false,
  })
  async function markRead(id: string) {
    z.uuid().parse(id)
    const response = await request(`/api/notifications/${id}/read`, 'POST')
    notificationSchema.parse(await response.json())
    await client.invalidateQueries({ queryKey: ['private', userId, 'notifications'] })
  }
  return { ...query, markRead }
}

import { z } from 'zod'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../auth/auth'
import { occurrenceSchema, occurrenceStatusSchema } from '../occurrence/occurrence'

export const accountStatusSchema = z.enum(['PENDING_ACTIVATION', 'ACTIVE', 'DISABLED'])
export const accountStatusLabels = { PENDING_ACTIVATION: 'Aguardando ativação', ACTIVE: 'Ativo', DISABLED: 'Desativado' } as const
export const adminSchema = z.object({ id: z.uuid(), name: z.string(), email: z.string(), status: accountStatusSchema, createdAt: z.iso.datetime() })
export const invitationSchema = z.object({ admin: adminSchema, mailStatus: z.enum(['ACCEPTED', 'FAILED']) })
export type Admin = z.infer<typeof adminSchema>
const metadata = { page: z.number().int().nonnegative(), size: z.number().int().positive(), totalItems: z.number().int().nonnegative(), totalPages: z.number().int().nonnegative() }
export const adminPageSchema = z.object({ ...metadata, items: z.array(adminSchema) })
export const moderationQueueSchema = z.object({ ...metadata, items: z.array(occurrenceSchema) })
export const moderationDetailSchema = z.object({ report: occurrenceSchema, history: z.array(z.object({
  id: z.uuid(), previousStatus: occurrenceStatusSchema, newStatus: occurrenceStatusSchema,
  occurredAt: z.iso.datetime(), reason: z.string().nullable(), responsible: z.string().min(1),
})) })
export function useAdministrativeQuery<T>(resource: 'admins' | 'moderation', pageOrId: number | string, path: string, schema: z.ZodType<T>) {
  const { state, request } = useAuth()
  const userId = state.status === 'authenticated' ? state.user.id : null
  return useQuery({
    queryKey: ['private', userId, resource, pageOrId], enabled: userId !== null,
    queryFn: async ({ signal }) => {
      if (resource === 'moderation' && typeof pageOrId === 'string') z.uuid().parse(pageOrId)
      return schema.parse(await (await request(path, 'GET', signal)).json())
    },
    retry: false, staleTime: 0, refetchOnWindowFocus: false,
  })
}

import { z } from 'zod'
import { completePair, locationFields } from '../location/point'

export const occurrenceStatusSchema = z.enum(['PENDING', 'IN_ANALYSIS', 'RESOLVED', 'REJECTED'])
export const occurrenceBaseSchema = z.object({
  ...locationFields,
  id: z.uuid(),
  categoryId: z.number(),
  categoryName: z.string(),
  title: z.string(),
  description: z.string().nullable().optional().transform(value => value ?? null),
  version: z.number().int().nonnegative(),
  neighborhood: z.string(),
  reference: z.string(),
  status: occurrenceStatusSchema,
  createdAt: z.iso.datetime(),
})
export const occurrenceSchema = occurrenceBaseSchema.refine(completePair, { message: 'Incomplete location pair' })
export const occurrencesSchema = z.array(occurrenceSchema)
export type Occurrence = z.infer<typeof occurrenceSchema>

export const occurrenceHistoryEventSchema = z.object({
  id: z.uuid(),
  previousStatus: occurrenceStatusSchema,
  newStatus: occurrenceStatusSchema,
  occurredAt: z.iso.datetime(),
  reason: z.string().nullable(),
  responsible: z.literal('Moderação'),
})
export const occurrenceDetailSchema = occurrenceBaseSchema.extend({
  // Optional while the compatible frontend is published before the backend.
  history: z.array(occurrenceHistoryEventSchema).optional(),
}).refine(completePair, { message: 'Incomplete location pair' })
export type OccurrenceHistoryEvent = z.infer<typeof occurrenceHistoryEventSchema>

const statusLabels: Record<Occurrence['status'], string> = {
  PENDING: 'Pendente', IN_ANALYSIS: 'Em análise', RESOLVED: 'Resolvida', REJECTED: 'Rejeitada',
}

export function occurrenceStatusLabel(status: Occurrence['status']) {
  return statusLabels[status]
}

export function occurrenceDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

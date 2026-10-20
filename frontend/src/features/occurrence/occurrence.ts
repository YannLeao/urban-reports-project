import { z } from 'zod'
import { categoryIdSchema } from './category'
import { completePair, locationFields } from '../location/point'

export const occurrenceStatusSchema = z.enum(['PENDING', 'IN_ANALYSIS', 'RESOLVED', 'REJECTED'])
const mediaCommon = { id: z.uuid(), sizeBytes: z.number().int().positive().nullable(), position: z.number().int().min(0).max(4), endpoint: z.string() }
export const occurrenceMediaSchema = z.discriminatedUnion('type', [
  z.object({ ...mediaCommon, type: z.literal('IMAGE'), mime: z.enum(['image/jpeg', 'image/png', 'image/webp']).nullable() }),
  z.object({ ...mediaCommon, type: z.literal('VIDEO'), mime: z.literal('video/mp4'), sizeBytes: z.number().int().positive().max(26214400), position: z.literal(0),
    durationSeconds: z.number().positive().max(30.000002), width: z.number().int().positive().max(1280), height: z.number().int().positive().max(1280) }),
])
export const occurrenceBaseSchema = z.object({
  ...locationFields,
  media: z.array(occurrenceMediaSchema).min(1).max(5).refine(items => items.every(item => item.type === 'IMAGE') || items.length === 1 && items[0].type === 'VIDEO').optional(),
  id: z.uuid(),
  categoryId: categoryIdSchema,
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

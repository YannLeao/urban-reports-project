import { z } from 'zod'
import { cleanOccurrenceText, validOccurrenceText } from './occurrence-text'
import { occurrenceStatusSchema, type Occurrence } from './occurrence'

export const moderationActions: Record<Occurrence['status'], Occurrence['status'][]> = {
  PENDING: ['ACCEPTED', 'REJECTED'],
  ACCEPTED: ['RESOLVED'],
  RESOLVED: [],
  REJECTED: [],
}

export const transitionSchema = z.object({
  target: occurrenceStatusSchema,
  reason: z.string().nullable().optional(),
}).superRefine((value, context) => {
  if (value.target === 'REJECTED' || value.target === 'ACCEPTED') {
    if (value.reason == null || !validOccurrenceText(value.reason, 10, 500))
      context.addIssue({ code: 'custom', path: ['reason'], message: 'Informe um comentário de 10 a 500 caracteres.' })
  } else if (value.reason != null) {
    context.addIssue({ code: 'custom', path: ['reason'], message: 'Comentário é permitido somente na aceitação ou rejeição.' })
  }
}).transform(value => ({ ...value, reason: value.reason == null ? null : cleanOccurrenceText(value.reason) }))

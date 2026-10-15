import { z } from 'zod'
import { cleanOccurrenceText, validOccurrenceText } from './occurrence-text'
import { occurrenceStatusSchema, type Occurrence } from './occurrence'

export const moderationActions: Record<Occurrence['status'], Occurrence['status'][]> = {
  PENDING: ['IN_ANALYSIS', 'REJECTED'],
  IN_ANALYSIS: ['RESOLVED', 'REJECTED'],
  RESOLVED: [],
  REJECTED: [],
}

export const transitionSchema = z.object({
  target: occurrenceStatusSchema,
  reason: z.string().nullable().optional(),
}).superRefine((value, context) => {
  if (value.target === 'REJECTED') {
    if (value.reason == null || !validOccurrenceText(value.reason, 10, 500))
      context.addIssue({ code: 'custom', path: ['reason'], message: 'Informe uma justificativa de 10 a 500 caracteres.' })
  } else if (value.reason != null) {
    context.addIssue({ code: 'custom', path: ['reason'], message: 'Justificativa é permitida somente na rejeição.' })
  }
}).transform(value => ({ ...value, reason: value.reason == null ? null : cleanOccurrenceText(value.reason) }))

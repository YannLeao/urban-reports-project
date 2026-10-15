import { z } from 'zod'
import { completePair } from '../location/point'
import { occurrenceBaseSchema } from './occurrence'

export const publicOccurrenceSchema = occurrenceBaseSchema.omit({ version: true }).refine(completePair, { message: 'Incomplete location pair' })

export const publicOccurrencePageSchema = z.object({
  items: z.array(publicOccurrenceSchema),
  page: z.number().int().nonnegative(),
  size: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
})

export type PublicOccurrence = z.infer<typeof publicOccurrenceSchema>
export type PublicOccurrencePage = z.infer<typeof publicOccurrencePageSchema>
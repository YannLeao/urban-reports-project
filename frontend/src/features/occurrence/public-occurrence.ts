import { z } from 'zod'
import { occurrenceSchema } from './occurrence'

export const publicOccurrenceSchema = occurrenceSchema.omit({ version: true })

export const publicOccurrencePageSchema = z.object({
  items: z.array(publicOccurrenceSchema),
  page: z.number().int().nonnegative(),
  size: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
})

export type PublicOccurrence = z.infer<typeof publicOccurrenceSchema>
export type PublicOccurrencePage = z.infer<typeof publicOccurrencePageSchema>
import { z } from 'zod'
import { pointSchema } from '../location/point'
import { categoryIdSchema } from './category'
import { occurrenceStatusSchema } from './occurrence'

export const markerSchema = pointSchema.extend({
  id: z.uuid(), categoryId: categoryIdSchema, categoryName: z.string(), title: z.string(), status: occurrenceStatusSchema,
})
export type OccurrenceMarker = z.infer<typeof markerSchema>
export const markerSetSchema = z.object({
  items: z.array(markerSchema), total: z.number().int().nonnegative(), located: z.number().int().nonnegative(), unlocated: z.number().int().nonnegative(),
}).refine(value => value.total === value.located + value.unlocated && value.items.length === value.located
  && new Set(value.items.map(item => item.id)).size === value.items.length, { message: 'Incomplete or inconsistent marker set' })

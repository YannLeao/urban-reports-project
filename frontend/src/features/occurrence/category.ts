import { z } from 'zod'

export const categoryIdSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6), z.literal(7), z.literal(8)])
export type CategoryId = z.infer<typeof categoryIdSchema>

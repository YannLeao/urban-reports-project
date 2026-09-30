import { z } from 'zod'

export const occurrenceSchema = z.object({
  id: z.uuid(),
  categoryId: z.number(),
  categoryName: z.string(),
  title: z.string(),
  description: z.string(),
  neighborhood: z.string(),
  reference: z.string(),
  status: z.enum(['PENDING']),
  createdAt: z.iso.datetime(),
})
export const occurrencesSchema = z.array(occurrenceSchema)
export type Occurrence = z.infer<typeof occurrenceSchema>

export function occurrenceStatusLabel(status: Occurrence['status']) {
  return status === 'PENDING' ? 'Pendente' : status
}

export function occurrenceDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

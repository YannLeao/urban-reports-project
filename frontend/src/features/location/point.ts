import { z } from 'zod'

export const pointSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
})
export type GeographicPoint = z.infer<typeof pointSchema>

// An absent field is accepted during frontend-first publication against the old API.
export const locationFields = {
  latitude: pointSchema.shape.latitude.nullable().optional().transform(value => value ?? null),
  longitude: pointSchema.shape.longitude.nullable().optional().transform(value => value ?? null),
}
export function completePair(value: { latitude: number | null; longitude: number | null }) {
  return (value.latitude === null) === (value.longitude === null)
}
export function readPoint(latitude: string, longitude: string): GeographicPoint | null {
  const decimal = /^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/
  if (!decimal.test(latitude) || !decimal.test(longitude)) return null
  const result = pointSchema.safeParse({ latitude: Number(latitude), longitude: Number(longitude) })
  return result.success ? result.data : null
}

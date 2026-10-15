import { z } from 'zod'
import { pointSchema } from './point'

const httpsUrl = z.url().refine(value => {
  const url = new URL(value)
  return url.protocol === 'https:' && !url.username && !url.password && !url.hash
})
export const mapConfigSchema = z.object({
  center: pointSchema,
  zoom: z.number().int().min(0).max(19),
  tileUrl: httpsUrl.refine(value => ['{z}', '{x}', '{y}'].every(part => value.includes(part))),
  attribution: z.string().min(1),
  attributionUrl: httpsUrl,
})
export async function loadMapConfig(signal: AbortSignal) {
  const response = await fetch(`${import.meta.env.BASE_URL}map-config.json`, { signal, credentials: 'omit', redirect: 'error' })
  if (!response.ok) throw new Error('Map configuration unavailable')
  const payload: unknown = await response.json()
  return mapConfigSchema.parse(payload)
}

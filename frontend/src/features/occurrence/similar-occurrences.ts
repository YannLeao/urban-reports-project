import { z } from 'zod'
import type { useAuth } from '../auth/auth'

export type SimilarCriteria = { categoryId: number; latitude: number; longitude: number; excludeOccurrenceId?: string }
export const similarOccurrencesSchema = z.strictObject({
  hasSimilar: z.boolean(),
})
export type SimilarResult = z.infer<typeof similarOccurrencesSchema>

// AuthProvider returns at response headers. Keep body consumption cancelable too.
async function readSimilarJson(response: Response, signal: AbortSignal): Promise<unknown> {
  if (!response.body) throw new Error('Consulta indisponível')
  const reader = response.body.getReader()
  const cancel = () => { void reader.cancel().catch(() => {}) }
  signal.addEventListener('abort', cancel, { once: true })
  const decoder = new TextDecoder()
  let bytes = 0, text = ''
  try {
    if (signal.aborted) throw new Error('Consulta indisponível')
    for (;;) {
      const chunk = await reader.read()
      if (signal.aborted) throw new Error('Consulta indisponível')
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > 32768) throw new Error('Consulta inválida')
      text += decoder.decode(chunk.value, { stream: true })
    }
    return JSON.parse(text + decoder.decode()) as unknown
  } finally {
    signal.removeEventListener('abort', cancel)
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

export async function querySimilar(request: ReturnType<typeof useAuth>['request'], criteria: SimilarCriteria, signal: AbortSignal) {
  const controller = new AbortController()
  const cancel = () => controller.abort()
  signal.addEventListener('abort', cancel, { once: true })
  if (signal.aborted) cancel()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    // Race also bounds a stalled response body, even if a transport ignores abort.
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('Consulta indisponível')) }, 10_000)
    })
    return await Promise.race([timeout, (async () => {
      const response = await request('/api/occurrences/similar', 'POST', controller.signal,
        JSON.stringify(criteria), { 'Content-Type': 'application/json' })
      const result = similarOccurrencesSchema.parse(await readSimilarJson(response, controller.signal))
      return result
    })()])
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', cancel)
  }
}

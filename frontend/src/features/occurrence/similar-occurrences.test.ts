import { expect, test, vi } from 'vitest'
import { querySimilar, similarOccurrencesSchema } from './similar-occurrences'

test('accepts only a boolean indicator and rejects legacy or expanded responses', () => {
  for (const hasSimilar of [true, false]) expect(similarOccurrencesSchema.parse({ hasSimilar })).toEqual({ hasSimilar })
  for (const invalid of [null, {}, { hasSimilar: 'true' }, { hasSimilar: 1 },
    { radiusMeters: 100, limit: 5, items: [] }, { hasSimilar: true, items: [] },
    { hasSimilar: true, count: 1 }, { hasSimilar: false, id: 'foreign-id' },
  ]) expect(similarOccurrencesSchema.safeParse(invalid).success).toBe(false)
})
test('timeout is bounded at 10s and aborts a stalled request', async () => {
  vi.useFakeTimers()
  try {
    const request = vi.fn(() => new Promise<Response>(() => {}))
    const pending = querySimilar(request, { categoryId: 1, latitude: 0, longitude: 0 }, new AbortController().signal)
    const rejected = expect(pending).rejects.toThrow('Consulta indisponível')
    await vi.advanceTimersByTimeAsync(10_000)
    await rejected
    expect(request.mock.calls[0]).toBeDefined()
    const signal = (request.mock.calls[0] as unknown as [string, string, AbortSignal])[2]
    expect(signal.aborted).toBe(true)
  } finally { vi.useRealTimers() }
})

test('timeout also cancels a stalled body after successful response headers', async () => {
  vi.useFakeTimers()
  try {
    const cancel = vi.fn()
    const body = new ReadableStream<Uint8Array>({ cancel })
    const request = vi.fn(async () => new Response(body))
    const pending = querySimilar(request, { categoryId: 1, latitude: 0, longitude: 0 }, new AbortController().signal)
    const rejected = expect(pending).rejects.toThrow('Consulta indisponível')
    await vi.advanceTimersByTimeAsync(10_000)
    await rejected
    expect(cancel).toHaveBeenCalledOnce()
  } finally { vi.useRealTimers() }
})

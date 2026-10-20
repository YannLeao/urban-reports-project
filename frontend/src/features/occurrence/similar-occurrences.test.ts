import { expect, test, vi } from 'vitest'
import { querySimilar, similarOccurrencesSchema } from './similar-occurrences'

const item = { id: 'c50062d3-9ac2-4e70-86fa-eac5249f4d0c', categoryId: 1, categoryName: 'Iluminação pública',
  title: 'Poste apagado', neighborhood: 'Centro', reference: 'Praça central', status: 'PENDING',
  createdAt: '2026-10-19T12:00:00Z', distanceMeters: 32.4 }
const result = { radiusMeters: 100, limit: 5, items: [item] }
test('dedicated contract rejects non-public, incomplete, nonfinite or excessive data', () => {
  expect(similarOccurrencesSchema.parse(result)).toEqual(result)
  for (const invalid of [
    { ...result, radiusMeters: 99 }, { ...result, limit: 6 }, { ...result, items: Array(6).fill(item) },
    ...[{ status: 'RESOLVED' }, { distanceMeters: Infinity }, { distanceMeters: NaN }, { distanceMeters: -1 },
      { distanceMeters: 100.001 }, { createdAt: 'yesterday' }, { id: 'invalid' }, { latitude: 0 }, { authorId: item.id }, { media: [] },
    ].map(patch => ({ ...result, items: [{ ...item, ...patch }] })),
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

import { expect, test, vi } from 'vitest'
import { occurrenceSchema } from '../occurrence/occurrence'
import { publicOccurrenceSchema } from '../occurrence/public-occurrence'
import { mapConfigSchema, loadMapConfig } from './map-config'
import { readPoint } from './point'
import config from '../../../public/map-config.json'

const report = { id: '3e85aa3d-19e3-42a3-8861-c435ff5908af', categoryId: 1, categoryName: 'Categoria',
  title: 'Título', description: null, neighborhood: 'Centro', reference: 'Referência', version: 0,
  status: 'PENDING', createdAt: '2026-10-15T12:00:00Z' }

test.each([occurrenceSchema, publicOccurrenceSchema])('read contracts accept legacy or a complete finite pair', schema => {
  expect(schema.parse(report)).toMatchObject({ latitude: null, longitude: null })
  for (const [latitude, longitude] of [[0, 0], [90, 180], [-90, -180], [-23.550520123456, -46.633308987654]])
    expect(schema.parse({ ...report, latitude, longitude })).toMatchObject({ latitude, longitude })
  for (const pair of [{ latitude: 1 }, { latitude: null, longitude: 1 }, { latitude: 91, longitude: 0 },
    { latitude: 0, longitude: -181 }, { latitude: NaN, longitude: 1 }, { latitude: Infinity, longitude: 1 }])
    expect(schema.safeParse({ ...report, ...pair }).success).toBe(false)
})
test('textual coordinates preserve axes and decimal precision and reject coercion of empty values', () => {
  expect(readPoint('-23.550520123456', '-46.633308987654')).toEqual({ latitude: -23.550520123456, longitude: -46.633308987654 })
  expect(readPoint('0', '0')).toEqual({ latitude: 0, longitude: 0 })
  for (const value of ['', ' ', 'NaN', 'Infinity', '1e999', '0x10', '12,3']) expect(readPoint(value, '0')).toBeNull()
})
test('runtime map configuration validates external JSON and preserves safe public HTTPS templates', async () => {
  expect(mapConfigSchema.parse(config)).toEqual(config)
  for (const tileUrl of ['http://example.com/{z}/{x}/{y}', 'https://user:pass@example.com/{z}/{x}/{y}', 'https://example.com/missing'])
    expect(mapConfigSchema.safeParse({ ...config, tileUrl }).success).toBe(false)
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(config)).mockResolvedValueOnce(Response.json({ center: 'bad' }))
  vi.stubGlobal('fetch', fetchMock)
  const controller = new AbortController()
  expect(await loadMapConfig(controller.signal)).toEqual(config)
  expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: 'omit', redirect: 'error', signal: controller.signal })
  await expect(loadMapConfig(controller.signal)).rejects.toThrow()
})

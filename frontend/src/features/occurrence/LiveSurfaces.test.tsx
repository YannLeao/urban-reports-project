import { act, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider, focusManager, onlineManager } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { z } from 'zod'
import { usePublicOccurrences } from './usePublicOccurrences'
import { usePublicMarkers } from './useMarkers'
import { useAdministrativeQuery } from '../administration/administration'
import { useSimilarOccurrences } from './useSimilarOccurrences'

const fetchMock = vi.fn<typeof fetch>()
const identity = { status: 'authenticated', user: { id: 'synthetic-user', role: 'ADMIN' } }
const request = vi.fn<(path: string, method?: string, signal?: AbortSignal) => Promise<Response>>()
vi.mock('../auth/auth', () => ({ useAuth: () => ({ state: identity, request }) }))
let client: QueryClient
function List({ map }: { map: boolean }) {
  usePublicOccurrences(0, !map)
  return map ? <Markers /> : <p>Lista</p>
}
function Markers() { usePublicMarkers(); return <p>Mapa</p> }
function OtherRead({ resource, detail = false }: { resource: 'admins' | 'moderation'; detail?: boolean }) {
  const data = useAdministrativeQuery(resource, detail ? 'b50062d3-9ac2-4e70-86fa-eac5249f4d0c' : 0, '/api/inspection', z.string())
  return <p>{data.data}</p>
}
function Similar() { useSimilarOccurrences({ categoryId: 1, latitude: 0, longitude: 0 }); return null }
async function tick(ms = 1) { await act(async () => { await vi.advanceTimersByTimeAsync(ms) }) }
beforeEach(() => {
  vi.useFakeTimers(); focusManager.setFocused(true); onlineManager.setOnline(true)
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } })
  vi.stubEnv('VITE_API_URL', 'https://api.example.com')
  fetchMock.mockReset().mockImplementation(async url => Response.json(String(url).includes('/markers') ? { items: [], total: 0, located: 0, unlocated: 0 } : { items: [], page: 0, size: 20, totalItems: 0, totalPages: 0 }))
  request.mockReset().mockImplementation(async () => Response.json('inspection'))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { client.clear(); vi.useRealTimers(); focusManager.setFocused(undefined); onlineManager.setOnline(true) })
test('actual hooks poll only list OR markers; view changes reuse fresh cache without duplicate reads', async () => {
  const view = render(<QueryClientProvider client={client}><List map={false} /></QueryClientProvider>); await tick()
  await tick(60_000); expect(fetchMock.mock.calls).toHaveLength(2)
  expect(fetchMock.mock.calls.every(([url]) => !String(url).includes('/markers'))).toBe(true)
  view.rerender(<QueryClientProvider client={client}><List map /></QueryClientProvider>); await tick()
  await tick(60_000)
  expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/markers'))).toHaveLength(2)
  expect(fetchMock.mock.calls.filter(([url]) => !String(url).includes('/markers'))).toHaveLength(2)
  view.rerender(<QueryClientProvider client={client}><List map={false} /></QueryClientProvider>); await tick()
  view.rerender(<QueryClientProvider client={client}><List map /></QueryClientProvider>); await tick()
  // List was stale; marker result was still fresh. Neither mode owns both timers.
  expect(fetchMock).toHaveBeenCalledTimes(5)
  expect(screen.getByText('Mapa')).toBeVisible()
})
test.each([['admins', false, 1], ['moderation', true, 1], ['moderation', false, 4]] as const)('%s detail=%s has only its intended update policy', async (resource, detail, count) => {
  render(<QueryClientProvider client={client}><OtherRead resource={resource} detail={detail} /></QueryClientProvider>); await tick(); await tick(180_000)
  expect(request).toHaveBeenCalledTimes(count)
})
test('similar lookup never starts an interval', async () => {
  request.mockImplementation(async () => Response.json({ items: [], radiusMeters: 100, limit: 5 }))
  render(<QueryClientProvider client={client}><Similar /></QueryClientProvider>); await tick(); await tick(600_000)
  expect(request).toHaveBeenCalledTimes(1)
})

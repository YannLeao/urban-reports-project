import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter, MemoryRouter } from 'react-router'
import { beforeEach, expect, test, vi } from 'vitest'
import App from '../../App'
import { AuthProvider } from '../auth/AuthProvider'
import { STORAGE_KEY } from '../auth/auth'
import type { OccurrenceMarker } from './markers'

const mapCallbacks = vi.hoisted(() => ({ move: undefined as ((view: { latitude: number; longitude: number; zoom: number }) => void) | undefined }))

vi.mock('../location/OccurrenceMap', () => ({ OccurrenceMap: ({ items, onSelect, onGroup, refresh, onView }: {
  items: OccurrenceMarker[]; onSelect?: (id: string) => void; onGroup?: (items: OccurrenceMarker[]) => void; refresh?: { run: () => void }; onView?: (view: { latitude: number; longitude: number; zoom: number }) => void
}) => { mapCallbacks.move = onView; return <div aria-label="Mapa simulado">
  <button onClick={refresh?.run}>Atualizar mapa</button>
  <button onClick={() => { onSelect?.(items[0].id); onView?.({ latitude: -8, longitude: -36, zoom: 14 }) }}>Selecionar durante redimensionamento</button>
  {items.map(item => <button key={item.id} onClick={() => onSelect?.(item.id)}>Pino {item.title}</button>)}
  <button onClick={() => onGroup?.(items)}>Abrir grupo simulado</button>
</div> } }))
const fetchMock = vi.fn<typeof fetch>()
const person = { id: 'a50062d3-9ac2-4e70-86fa-eac5249f4d0c', name: 'Ana', email: 'ana@example.com', role: 'USER' }
const markers = Array.from({ length: 61 }, (_, index) => ({ id: `b50062d3-9ac2-4e70-86fa-${index.toString().padStart(12, '0')}`,
  latitude: 0, longitude: 0, title: `Relato ${index}`, categoryId: 1 as const, categoryName: 'Iluminação pública', status: 'PENDING' as const }))
const set = { items: markers, total: 63, located: 61, unlocated: 2 }
beforeEach(() => {
  sessionStorage.clear(); fetchMock.mockReset()
  window.history.replaceState(null, '', '/')
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.stubEnv('VITE_API_URL', 'https://api.example.com')
})
function renderPage(path = '/ocorrencias?visao=mapa&pagina=3') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(<QueryClientProvider client={client}><AuthProvider><MemoryRouter initialEntries={[path]}><App /></MemoryRouter></AuthProvider></QueryClientProvider>)
  return { client, ...view }
}
function authenticate() { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ accessToken: 'synthetic-token', expiresAt: new Date(Date.now() + 1800000).toISOString() })) }

test('anonymous map queries a complete set beyond the card page without Bearer, photos or GPS', async () => {
  fetchMock.mockResolvedValue(Response.json(set))
  renderPage()
  expect(await screen.findByText('Há 2 relatos sem ponto no mapa.')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Pino Relato 60' })).toBeVisible()
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.com/api/public/occurrences/markers')
  expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: 'omit', redirect: 'error' })
  expect(fetchMock.mock.calls[0][1]?.headers).toBeUndefined()
  expect(screen.getByRole('link', { name: 'Lista' })).toHaveAttribute('href', '/ocorrencias?pagina=3')
})
test('selects overlapping reports and returns from detail to the same map, page and selection', async () => {
  const single = markers[60]
  fetchMock.mockImplementation(async url => String(url).endsWith('/markers') ? Response.json(set) : Response.json({ ...single,
    latitude: null, longitude: null, description: null, neighborhood: 'Centro', reference: 'Praça', createdAt: '2026-10-15T12:00:00Z' }))
  renderPage()
  await userEvent.click(await screen.findByRole('button', { name: 'Abrir grupo simulado' }))
  const group = screen.getByRole('region', { name: 'Relatos do grupo' })
  await userEvent.click(within(group).getByRole('button', { name: 'Relato 60 · Iluminação pública' }))
  const selected = await screen.findByRole('region', { name: 'Relato selecionado' })
  await within(selected).findByRole('link', { name: 'Ver relato: Relato 60' })
  await userEvent.click(within(selected).getByRole('link', { name: 'Ver relato: Relato 60' }))
  expect(await screen.findByText('Localização no mapa não informada.')).toBeVisible()
  const back = screen.getByRole('link', { name: '← Relatos' })
  expect(back.getAttribute('href')).toContain('visao=mapa')
  expect(back.getAttribute('href')).toContain('pagina=3')
  expect(back.getAttribute('href')).toContain(`selecionado=${single.id}`)
  await userEvent.click(back)
  expect(await within(await screen.findByRole('region', { name: 'Relato selecionado' })).findByRole('heading', { name: 'Relato 60' })).toBeVisible()
})
test('failed refresh preserves prior markers with explicit stale feedback and supports recovery', async () => {
  fetchMock.mockResolvedValueOnce(Response.json(set)).mockRejectedValueOnce(new TypeError('private detail')).mockResolvedValue(Response.json({ items: [], total: 2, located: 0, unlocated: 2 }))
  renderPage(); await screen.findByText('Há 2 relatos sem ponto no mapa.')
  await userEvent.click(screen.getByRole('button', { name: 'Atualizar mapa' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('dados anteriores')
  expect(screen.getByRole('button', { name: 'Pino Relato 60' })).toBeVisible()
  await userEvent.click(screen.getByRole('button', { name: 'Atualizar mapa' }))
  expect(await screen.findByText('Os relatos ainda não têm localização no mapa.')).toBeVisible()
})
test('rejects a partial/inconsistent response instead of claiming the set is complete', async () => {
  fetchMock.mockResolvedValue(Response.json({ ...set, items: markers.slice(0, 20) }))
  renderPage()
  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível atualizar os pontos')
  expect(screen.queryByText('Há 2 relatos sem ponto no mapa.')).not.toBeInTheDocument()
})
test('empty and initial network failures remain distinct and list is always accessible', async () => {
  fetchMock.mockRejectedValueOnce(new TypeError('network')).mockResolvedValue(Response.json({ items: [], total: 0, located: 0, unlocated: 0 }))
  renderPage(); await screen.findByRole('alert')
  expect(screen.getByRole('link', { name: 'Lista' })).toBeVisible()
  await userEvent.click(screen.getByRole('button', { name: 'Atualizar mapa' }))
  expect(await screen.findByText('Ainda não há relatos nesta consulta.')).toBeVisible()
})
test('HTML-like titles render as text in selection and links', async () => {
  const title = '<img src=x onerror="alert(1)">'
  fetchMock.mockImplementation(async url => String(url).endsWith('/markers') ? Response.json({ items: [{ ...markers[0], title }], total: 1, located: 1, unlocated: 0 }) : Response.json({ ...markers[0], title, neighborhood: 'Centro', reference: 'Praça', createdAt: '2026-10-15T12:00:00Z' }))
  renderPage(); await userEvent.click(await screen.findByRole('button', { name: `Pino ${title}` }))
  expect(await within(screen.getByRole('region', { name: 'Relato selecionado' })).findByRole('heading', { name: title })).toBeVisible()
  expect(document.querySelector('img[src="x"]')).toBeNull()
})
test('private map uses session identity, user-scoped cache and clears it on session loss', async () => {
  authenticate()
  fetchMock.mockImplementation(async url => String(url).endsWith('/auth/me') ? Response.json(person) : Response.json(set))
  const { client } = renderPage('/meus-relatos?visao=mapa')
  await screen.findByText('Há 2 relatos sem ponto no mapa.')
  expect(client.getQueryData(['private', person.id, 'occurrences', 'markers'])).toMatchObject(set)
  const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/api/occurrences/markers'))!
  expect(call[1]?.headers).toEqual({ Authorization: 'Bearer synthetic-token' })
  fetchMock.mockResolvedValueOnce(Response.json({ code: 'UNAUTHORIZED' }, { status: 401 }))
  await userEvent.click(screen.getByRole('button', { name: 'Atualizar mapa' }))
  await screen.findByRole('heading', { name: 'Entrar' })
  await waitFor(() => expect(client.getQueryCache().findAll({ queryKey: ['private'] })).toHaveLength(0))
  expect(screen.queryByText(/63 relatos/)).toBeNull()
})
test('leaving private map cancels request and late response cannot expose markers', async () => {
  authenticate()
  let resolve!: (response: Response) => void
  fetchMock.mockResolvedValueOnce(Response.json(person)).mockReturnValueOnce(new Promise<Response>(done => { resolve = done }))
  const view = renderPage('/meus-relatos?visao=mapa')
  await screen.findByText('Carregando todos os pontos…')
  const signal = fetchMock.mock.calls[1][1]?.signal
  view.unmount(); expect(signal?.aborted).toBe(true)
  await act(async () => { resolve(Response.json(set)) })
  expect(view.client.getQueryCache().findAll({ queryKey: ['private'] })).toHaveLength(0)
})
test('a public report removed after selection refreshes markers and removes selection from return URL', async () => {
  fetchMock.mockImplementation(async url => String(url).endsWith('/markers') ? Response.json(set) : Response.json({}, { status: 404 }))
  const view = renderPage(`/ocorrencias/${markers[0].id}`)
  expect(await screen.findByRole('alert')).toHaveTextContent('não foi encontrado')
  expect(screen.queryByRole('region', { name: 'Localização no mapa' })).toBeNull()
  expect(view.client.getQueryCache().findAll({ queryKey: ['public', 'occurrences', 'markers'] })).toHaveLength(0)
})

test('selected report removed from public visibility clears selection and refreshes the complete marker set', async () => {
  let markerReads = 0
  fetchMock.mockImplementation(async url => String(url).endsWith('/markers')
    ? Response.json(++markerReads === 1 ? set : { items: [], total: 0, located: 0, unlocated: 0 })
    : Response.json({}, { status: 404 }))
  renderPage()
  await userEvent.click(await screen.findByRole('button', { name: 'Pino Relato 0' }))
  expect(await screen.findByText('Este relato não está mais disponível nesta consulta.')).toBeVisible()
  await waitFor(() => expect(markerReads).toBe(2))
  expect(screen.queryByRole('region', { name: 'Relato selecionado' })).toBeNull()
  expect(screen.queryByRole('img', { name: /Foto do problema/ })).toBeNull()
})
test('no selected-detail read or photo until a point is chosen; closing removes the preview', async () => {
  fetchMock.mockImplementation(async url => String(url).endsWith('/markers') ? Response.json(set) : Response.json({ ...markers[0], neighborhood: 'Centro', reference: 'Praça', createdAt: '2026-10-15T12:00:00Z' }))
  renderPage()
  await screen.findByRole('button', { name: 'Pino Relato 0' })
  expect(fetchMock).toHaveBeenCalledTimes(1)
  await userEvent.click(screen.getByRole('button', { name: 'Pino Relato 0' }))
  const panel = screen.getByRole('region', { name: 'Relato selecionado' })
  expect(await within(panel).findByRole('img', { name: 'Foto do problema: Relato 0' })).toHaveAttribute('src', `https://api.example.com/api/public/occurrences/${markers[0].id}/image`)
  fireEvent.error(within(panel).getByRole('img', { name: 'Foto do problema: Relato 0' }))
  expect(within(panel).getByText('Foto não abriu')).toBeVisible()
  expect(within(panel).getByRole('link', { name: 'Ver relato: Relato 0' })).toBeVisible()
  await userEvent.click(within(panel).getByRole('button', { name: 'Fechar relato selecionado' }))
  expect(screen.queryByRole('region', { name: 'Relato selecionado' })).toBeNull()
})

test('selection and a simultaneous map resize merge URL updates without losing context', async () => {
  fetchMock.mockImplementation(async url => String(url).endsWith('/markers') ? Response.json(set) : Response.json({ ...markers[0], neighborhood: 'Centro', reference: 'Praça', createdAt: '2026-10-15T12:00:00Z' }))
  renderPage()
  await userEvent.click(await screen.findByRole('button', { name: 'Selecionar durante redimensionamento' }))
  const link = await within(screen.getByRole('region', { name: 'Relato selecionado' })).findByRole('link', { name: 'Ver relato: Relato 0' })
  await userEvent.click(link)
  const back = await screen.findByRole('link', { name: '← Relatos' })
  expect(back.getAttribute('href')).toContain(`selecionado=${markers[0].id}`)
  expect(back.getAttribute('href')).toContain('lat=-8.000000')
  expect(back.getAttribute('href')).toContain('zoom=14')
})

test('private selection reads only its own detail/photo with Bearer and releases both on session loss', async () => {
  authenticate()
  vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: vi.fn(() => 'blob:selected-photo'), revokeObjectURL: vi.fn() }))
  fetchMock.mockImplementation(async url => {
    const path = String(url)
    if (path.endsWith('/auth/me')) return Response.json(person)
    if (path.endsWith('/markers')) return Response.json(set)
    if (path.endsWith('/image')) return new Response('synthetic-image', { headers: { 'Content-Type': 'image/png' } })
    return Response.json({ ...markers[0], version: 0, neighborhood: 'Centro', reference: 'Praça', createdAt: '2026-10-15T12:00:00Z' })
  })
  const { client } = renderPage('/meus-relatos?visao=mapa')
  await userEvent.click(await screen.findByRole('button', { name: 'Pino Relato 0' }))
  expect(await screen.findByRole('img', { name: 'Foto do problema: Relato 0' })).toHaveAttribute('src', 'blob:selected-photo')
  const imageCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/image'))!
  expect(imageCall[0]).toBe(`https://api.example.com/api/occurrences/${markers[0].id}/image`)
  expect(imageCall[1]?.headers).toEqual({ Authorization: 'Bearer synthetic-token' })
  expect(client.getQueryData(['private', person.id, 'occurrences', markers[0].id])).toMatchObject({ title: 'Relato 0' })
  fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }))
  await userEvent.click(screen.getByRole('button', { name: 'Atualizar mapa' }))
  await screen.findByRole('heading', { name: 'Entrar' })
  expect(client.getQueryCache().findAll({ queryKey: ['private'] })).toHaveLength(0)
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:selected-photo')
  expect(screen.queryByRole('region', { name: 'Relato selecionado' })).toBeNull()
})

test('a late movement from a map that was left cannot navigate away from the next page', async () => {
  fetchMock.mockResolvedValue(Response.json(set))
  renderPage()
  await screen.findByRole('button', { name: 'Pino Relato 0' })
  const lateMove = mapCallbacks.move!
  await userEvent.click(within(screen.getByRole('navigation', { name: 'Navegação principal' })).getByRole('link', { name: 'Entrar' }))
  await screen.findByRole('heading', { name: 'Entrar' })
  act(() => lateMove({ latitude: 12, longitude: 34, zoom: 15 }))
  expect(screen.getByRole('heading', { name: 'Entrar' })).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Pino Relato 0' })).toBeNull()
})

test('BrowserRouter viewport updates cannot overwrite a navigation whose history changed before the React commit', async () => {
  fetchMock.mockResolvedValue(Response.json(set))
  window.history.replaceState(null, '', '/ocorrencias?visao=mapa')
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><AuthProvider><BrowserRouter><App /></BrowserRouter></AuthProvider></QueryClientProvider>)
  await screen.findByRole('button', { name: 'Pino Relato 0' })
  const oldMove = mapCallbacks.move!
  // History changes first during a transition; the old map is still mounted.
  window.history.pushState({ key: 'new-report-navigation' }, '', '/registrar-ocorrencia')
  act(() => oldMove({ latitude: 12, longitude: 34, zoom: 15 }))
  expect(window.location.pathname).toBe('/registrar-ocorrencia')
  act(() => window.dispatchEvent(new PopStateEvent('popstate')))
  expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeVisible()
  expect(window.location.pathname).toBe('/entrar')
})

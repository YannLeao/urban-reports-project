import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, expect, test, vi } from 'vitest'
import App from '../../App'
import { AuthProvider } from '../auth/AuthProvider'
import { STORAGE_KEY } from '../auth/auth'
import type { OccurrenceMarker } from './markers'

vi.mock('../location/OccurrenceMap', () => ({ OccurrenceMap: ({ items, onSelect, onGroup }: {
  items: OccurrenceMarker[]; onSelect?: (id: string) => void; onGroup?: (items: OccurrenceMarker[]) => void
}) => <div aria-label="Mapa simulado">
  {items.map(item => <button key={item.id} onClick={() => onSelect?.(item.id)}>Pino {item.title}</button>)}
  <button onClick={() => onGroup?.(items)}>Abrir grupo simulado</button>
</div> }))
const fetchMock = vi.fn<typeof fetch>()
const person = { id: 'a50062d3-9ac2-4e70-86fa-eac5249f4d0c', name: 'Ana', email: 'ana@example.com', role: 'USER' }
const markers = Array.from({ length: 61 }, (_, index) => ({ id: `b50062d3-9ac2-4e70-86fa-${index.toString().padStart(12, '0')}`,
  latitude: 0, longitude: 0, title: `Relato ${index}`, categoryId: 1 as const, categoryName: 'Iluminação pública', status: 'PENDING' as const }))
const set = { items: markers, total: 63, located: 61, unlocated: 2 }
beforeEach(() => {
  sessionStorage.clear(); fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
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
  expect(await screen.findByText(/63 relatos no total. 61 com localização. 2 sem localização/)).toBeVisible()
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
  const selected = screen.getByRole('region', { name: 'Relato selecionado' })
  await userEvent.click(within(selected).getByRole('link', { name: 'Abrir detalhes de Relato 60' }))
  expect(await screen.findByText('Localização no mapa não informada.')).toBeVisible()
  const back = screen.getByRole('link', { name: '← Ocorrências' })
  expect(back.getAttribute('href')).toContain('visao=mapa')
  expect(back.getAttribute('href')).toContain('pagina=3')
  expect(back.getAttribute('href')).toContain(`selecionado=${single.id}`)
  await userEvent.click(back)
  expect(await screen.findByRole('region', { name: 'Relato selecionado' })).toHaveTextContent('Relato 60')
})
test('failed refresh preserves prior markers with explicit stale feedback and supports recovery', async () => {
  fetchMock.mockResolvedValueOnce(Response.json(set)).mockRejectedValueOnce(new TypeError('private detail')).mockResolvedValue(Response.json({ items: [], total: 2, located: 0, unlocated: 2 }))
  renderPage(); await screen.findByText(/63 relatos no total/)
  await userEvent.click(screen.getByRole('button', { name: 'Atualizar mapa' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('dados anteriores')
  expect(screen.getByRole('button', { name: 'Pino Relato 60' })).toBeVisible()
  await userEvent.click(screen.getByRole('button', { name: 'Atualizar mapa' }))
  expect(await screen.findByText('Nenhum relato desta consulta tem localização no mapa.')).toBeVisible()
})
test('rejects a partial/inconsistent response instead of claiming the set is complete', async () => {
  fetchMock.mockResolvedValue(Response.json({ ...set, items: markers.slice(0, 20) }))
  renderPage()
  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível atualizar os pontos')
  expect(screen.queryByText(/63 relatos no total/)).not.toBeInTheDocument()
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
  fetchMock.mockResolvedValue(Response.json({ items: [{ ...markers[0], title }], total: 1, located: 1, unlocated: 0 }))
  renderPage(); await userEvent.click(await screen.findByRole('button', { name: `Pino ${title}` }))
  expect(screen.getByRole('region', { name: 'Relato selecionado' })).toHaveTextContent(title)
  expect(document.querySelector('img[src="x"]')).toBeNull()
})
test('private map uses session identity, user-scoped cache and clears it on session loss', async () => {
  authenticate()
  fetchMock.mockImplementation(async url => String(url).endsWith('/auth/me') ? Response.json(person) : Response.json(set))
  const { client } = renderPage('/meus-relatos?visao=mapa')
  await screen.findByText(/63 relatos no total/)
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
  expect(await screen.findByRole('alert')).toHaveTextContent('não foi encontrada')
  expect(screen.queryByRole('region', { name: 'Localização no mapa' })).toBeNull()
  expect(view.client.getQueryCache().findAll({ queryKey: ['public', 'occurrences', 'markers'] })).toHaveLength(0)
})

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import { beforeEach, expect, test, vi } from 'vitest'
import App from '../../App'
import { AuthProvider } from '../auth/AuthProvider'
import { STORAGE_KEY } from '../auth/auth'

const fetchMock = vi.fn<typeof fetch>()
const catalog = [{ id: 1, name: 'Iluminação pública' }, { id: 2, name: 'Buraco ou pavimentação' }]
const item = { id: '3e85aa3d-19e3-42a3-8861-c435ff5908af', categoryId: 1, categoryName: 'Iluminação pública', title: 'Relato sintético', description: null, neighborhood: 'Centro', reference: 'Praça', status: 'PENDING', createdAt: '2026-10-01T00:00:00Z', version: 0 }
const page = (items = [item]) => ({ items, page: 0, size: 20, totalItems: items.length, totalPages: 1 })
const person = { id: 'a50062d3-9ac2-4e70-86fa-eac5249f4d0c', name: 'Pessoa teste', email: 'test@example.com', role: 'ADMIN' }
function Address() { const location = useLocation(); return <output aria-label="Endereço">{location.search}</output> }
function mount(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><AuthProvider><MemoryRouter initialEntries={[path]}><App /><Address /></MemoryRouter></AuthProvider></QueryClientProvider>)
  return client
}
beforeEach(() => {
  sessionStorage.clear(); vi.stubEnv('VITE_API_URL', 'https://api.example.com'); fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock)
})
test('public controls combine filters, reset page once and preserve URL view and viewport on clear', async () => {
  fetchMock.mockImplementation(async url => String(url).endsWith('/occurrence-categories') ? Response.json(catalog) : Response.json(page()))
  mount('/ocorrencias?pagina=3&lat=0&lng=0&zoom=12')
  await screen.findByRole('option', { name: 'Buraco ou pavimentação' })
  await userEvent.selectOptions(screen.getByLabelText('Categoria'), '2')
  await userEvent.selectOptions(screen.getByLabelText('Estado'), 'IN_ANALYSIS')
  expect(screen.getByLabelText('Endereço')).toHaveTextContent('categoria=2&estado=IN_ANALYSIS')
  expect(screen.getByLabelText('Endereço')).not.toHaveTextContent('pagina=')
  await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('categoryId=2&status=IN_ANALYSIS'))).toBe(true))
  expect(screen.queryByRole('option', { name: 'Rejeitada' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }))
  expect(screen.getByLabelText('Endereço')).toHaveTextContent('lat=0&lng=0&zoom=12')
  expect(screen.getByLabelText('Endereço')).not.toHaveTextContent('categoria=')
})
test('invalid initial URL is warned and canonicalized before any invalid request; catalogue failure retries', async () => {
  let fail = true
  fetchMock.mockImplementation(async url => String(url).endsWith('/occurrence-categories') ? (fail ? Promise.reject(new Error('network')) : Response.json(catalog)) : Response.json(page([])))
  mount('/ocorrencias?categoria=2&categoria=3&estado=REJECTED&visao=lista')
  expect(await screen.findByText('Filtros inválidos foram ajustados para opções permitidas.')).toBeVisible()
  expect(await screen.findByText(/Não conseguimos carregar as categorias/)).toBeVisible()
  expect(screen.getByRole('option', { name: 'Todas as categorias' })).toBeVisible()
  expect(fetchMock.mock.calls.some(([url]) => String(url).includes('REJECTED') || String(url).includes('categoryId='))).toBe(false)
  fail = false; await userEvent.click(screen.getByRole('button', { name: 'Tentar carregar categorias novamente' }))
  expect(await screen.findByRole('option', { name: 'Buraco ou pavimentação' })).toBeVisible()
})
test('admin ALL enables final states and switching to queue clears only incompatible state atomically', async () => {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ accessToken: 'synthetic-token', expiresAt: new Date(Date.now() + 1800000).toISOString() }))
  fetchMock.mockImplementation(async url => String(url).endsWith('/auth/me') ? Response.json(person) : String(url).endsWith('/occurrence-categories') ? Response.json(catalog) : Response.json(page([])))
  mount('/administracao/relatos?escopo=todos&categoria=2&estado=RESOLVED&pagina=4')
  await screen.findByLabelText('Estado')
  expect(screen.getByRole('option', { name: 'Rejeitada' })).toBeVisible()
  await userEvent.click(screen.getByRole('button', { name: 'Fila de moderação' }))
  expect(await screen.findByText('O estado final foi removido ao voltar à fila de moderação.')).toBeVisible()
  await waitFor(() => expect(screen.getByLabelText('Endereço').textContent).toBe('?categoria=2'))
  expect(fetchMock.mock.calls.some(([url]) => String(url).includes('scope=QUEUE') && String(url).includes('status=RESOLVED'))).toBe(false)
  expect(fetchMock.mock.calls.some(([url]) => String(url).includes('scope=ALL') && String(url).includes('status=RESOLVED'))).toBe(true)
})
test('late selection A cannot replace B; B failure shows no cards from A and retry keeps criteria', async () => {
  let finishA: ((response: Response) => void) | undefined
  fetchMock.mockImplementation(async url => {
    if (String(url).endsWith('/occurrence-categories')) return Response.json(catalog)
    if (String(url).includes('categoryId=2')) return Response.json({ code: 'UNAVAILABLE' }, { status: 503 })
    return new Promise<Response>(resolve => { finishA = resolve })
  })
  mount('/ocorrencias')
  await screen.findByRole('option', { name: 'Buraco ou pavimentação' })
  await userEvent.selectOptions(screen.getByLabelText('Categoria'), '2')
  await screen.findByText('Não conseguimos carregar os relatos.')
  await act(async () => { finishA?.(Response.json(page())) })
  expect(screen.queryByRole('heading', { name: item.title })).not.toBeInTheDocument()
  expect(screen.queryByText('Nenhum relato com estes filtros')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
  await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('categoryId=2'))).toHaveLength(2))
})

test('list detail and its map link preserve active filters and page context', async () => {
  fetchMock.mockImplementation(async url => String(url).endsWith('/occurrence-categories') ? Response.json(catalog)
    : String(url).includes('/occurrences?') ? Response.json(page()) : Response.json(item))
  mount('/ocorrencias?categoria=1&estado=PENDING&pagina=2')
  await userEvent.click(await screen.findByRole('link', { name: item.title }))
  expect(await screen.findByRole('link', { name: 'Ver mapa dos relatos' })).toHaveAttribute('href', '/ocorrencias?categoria=1&estado=PENDING&pagina=2&visao=mapa')
  expect(screen.getByRole('link', { name: '← Relatos' })).toHaveAttribute('href', '/ocorrencias?categoria=1&estado=PENDING&pagina=2')
})

test('administrative emptiness distinguishes queue, global ALL and filtered results', async () => {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ accessToken: 'synthetic-token', expiresAt: new Date(Date.now() + 1800000).toISOString() }))
  fetchMock.mockImplementation(async url => String(url).endsWith('/auth/me') ? Response.json(person) : String(url).endsWith('/occurrence-categories') ? Response.json(catalog) : Response.json(page([])))
  mount('/administracao/relatos')
  expect(await screen.findByText('A fila de moderação está vazia.')).toBeVisible()
  await userEvent.click(screen.getByRole('button', { name: 'Todos os relatos' }))
  expect(await screen.findByText('Ainda não há relatos.')).toBeVisible()
  await userEvent.selectOptions(screen.getByLabelText('Categoria'), '2')
  expect(await screen.findByText('Nenhum relato com estes filtros.')).toBeVisible()
})

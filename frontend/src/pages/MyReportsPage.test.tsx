import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, expect, test, vi } from 'vitest'
import App from '../App'
import { AuthProvider } from '../features/auth/AuthProvider'
import { STORAGE_KEY } from '../features/auth/auth'

const person = { id: 'a50062d3-9ac2-4e70-86fa-eac5249f4d0c', name: 'Ana Silva', email: 'ana@example.com', role: 'USER' }
const report = {
  id: '3e85aa3d-19e3-42a3-8861-c435ff5908af', categoryId: 1,
  categoryName: 'Iluminação pública', title: 'Poste apagado na praça',
  description: 'A iluminação está apagada e dificulta a passagem à noite.',
  neighborhood: 'Centro', reference: 'Praça central', status: 'PENDING',
  createdAt: '2026-09-28T12:00:00Z',
}
const fetchMock = vi.fn<typeof fetch>()
beforeEach(() => {
  sessionStorage.clear()
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ accessToken: 'synthetic-token', expiresAt: new Date(Date.now() + 1800000).toISOString() }))
  fetchMock.mockReset().mockResolvedValueOnce(Response.json(person))
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('VITE_API_URL', 'https://api.example.com')
})
function renderPage(path = '/meus-relatos') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(<QueryClientProvider client={client}><AuthProvider><MemoryRouter initialEntries={[path]}><App /></MemoryRouter></AuthProvider></QueryClientProvider>)
  return { client, ...view }
}

test('loading is visible and leaving cancels the private request', async () => {
  let resolve!: (response: Response) => void
  fetchMock.mockReturnValueOnce(new Promise<Response>(done => { resolve = done }))
  const view = renderPage()
  expect(await screen.findByText('Carregando seus relatos…')).toBeVisible()
  const signal = fetchMock.mock.calls[1][1]?.signal
  view.unmount()
  expect(signal?.aborted).toBe(true)
  await act(async () => resolve(Response.json([report])))
  expect(view.client.getQueryCache().findAll({ queryKey: ['private'] })).toHaveLength(0)
})

test('empty state links to registration', async () => {
  fetchMock.mockResolvedValueOnce(Response.json([]))
  renderPage()
  expect(await screen.findByText('Você ainda não registrou relatos')).toBeVisible()
  expect(screen.getByRole('link', { name: 'Registrar problema' })).toHaveAttribute('href', '/registrar-ocorrencia')
})

test('list and detail use authenticated requests and user-scoped cache', async () => {
  fetchMock.mockResolvedValueOnce(Response.json([report])).mockResolvedValueOnce(Response.json(report))
  const { client } = renderPage()
  expect(await screen.findByRole('heading', { name: report.title })).toBeVisible()
  expect(screen.getByText('Pendente')).toBeVisible()
  expect(screen.getByText('Centro · Praça central')).toBeVisible()
  expect(client.getQueryData(['private', person.id, 'occurrences'])).toEqual([report])
  await userEvent.click(screen.getByRole('link', { name: 'Ver detalhes' }))
  expect(await screen.findByText(report.description)).toBeVisible()
  expect(client.getQueryData(['private', person.id, 'occurrences', report.id])).toEqual(report)
  expect(fetchMock.mock.calls[2][0]).toBe(`https://api.example.com/api/occurrences/${report.id}`)
  expect(fetchMock.mock.calls[2][1]).toMatchObject({ credentials: 'omit', redirect: 'error', headers: { Authorization: 'Bearer synthetic-token' } })
})

test.each(['network', 'invalid', 403, 503] as const)('list %s preserves session, hides internals and supports manual retry', async failure => {
  if (failure === 'network') fetchMock.mockImplementationOnce(() => Promise.reject(new Error('private server details')))
  else if (failure === 'invalid') fetchMock.mockResolvedValueOnce(Response.json([{ ...report, status: 'UNKNOWN' }]))
  else fetchMock.mockResolvedValueOnce(Response.json({ message: 'private server details' }, { status: failure }))
  fetchMock.mockResolvedValueOnce(Response.json([]))
  renderPage()
  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('Não conseguimos carregar seus relatos')
  expect(alert).not.toHaveTextContent('private server details')
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(sessionStorage.getItem(STORAGE_KEY)).not.toBeNull()
  await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
  expect(await screen.findByText('Você ainda não registrou relatos')).toBeVisible()
  expect(fetchMock).toHaveBeenCalledTimes(3)
})

test.each(['/meus-relatos', `/meus-relatos/${report.id}`])('401 at %s ends session and removes private cache', async path => {
  fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }))
  const { client } = renderPage(path)
  expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeVisible()
  expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()
  await waitFor(() => expect(client.getQueryCache().findAll({ queryKey: ['private'] })).toHaveLength(0))
})

test('detail 404 hides private data and permits retry', async () => {
  fetchMock.mockResolvedValueOnce(Response.json({ message: 'private server details' }, { status: 404 }))
    .mockResolvedValueOnce(Response.json(report))
  renderPage(`/meus-relatos/${report.id}`)
  expect(await screen.findByRole('alert')).toHaveTextContent('Ele pode não existir ou não pertencer à sua conta')
  expect(screen.queryByText(report.title)).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
  expect(await screen.findByText(report.description)).toBeVisible()
})

test('malformed detail id does not issue a private occurrence request', async () => {
  renderPage('/meus-relatos/invalid-id')
  expect(await screen.findByRole('alert')).toBeVisible()
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

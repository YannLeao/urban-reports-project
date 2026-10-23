import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import App from '../App'
import { AuthProvider } from '../features/auth/AuthProvider'
import { STORAGE_KEY } from '../features/auth/auth'
import { NOTIFICATIONS_REFETCH_INTERVAL } from '../features/notification/notifications'

const fetchMock = vi.fn<typeof fetch>()
const user = { id: 'a50062d3-9ac2-4e70-86fa-eac5249f4d0c', name: 'Ana', email: 'ana@example.com', role: 'USER' }
const item = { id: 'b50062d3-9ac2-4e70-86fa-eac5249f4d0c', occurrenceId: 'c50062d3-9ac2-4e70-86fa-eac5249f4d0c', type: 'OCCURRENCE_REJECTED', message: 'Seu relato foi rejeitado: <img src=x onerror=alert(1)>', createdAt: '2026-10-15T12:00:00Z', readAt: null }
const page = { items: [item], page: 0, size: 20, totalItems: 21, totalPages: 2, unreadCount: 21 }
beforeEach(() => { sessionStorage.clear(); fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); vi.stubEnv('VITE_API_URL', 'https://api.example.com') })
afterEach(() => { focusManager.setFocused(undefined); vi.useRealTimers(); vi.restoreAllMocks() })
function mount(path = '/notificacoes', authenticated = true) {
  if (authenticated) sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ accessToken: 'synthetic-token', expiresAt: new Date(Date.now() + 1800000).toISOString() }))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(<QueryClientProvider client={client}><AuthProvider><MemoryRouter initialEntries={[path]}><App /></MemoryRouter></AuthProvider></QueryClientProvider>)
  return { client, ...view }
}
function respond() { fetchMock.mockImplementation(async url => Response.json(String(url).endsWith('/auth/me') ? user : page)) }

test('bell shows global unread count and central renders rejection as text with report link', async () => {
  respond(); const { container, client } = mount()
  expect(await screen.findByRole('link', { name: 'Notificações: 21 não lidas' })).toHaveAttribute('href', '/notificacoes')
  expect(await screen.findByText(item.message)).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Atualizar notificações' })).not.toBeInTheDocument()
  expect(container.querySelector('main img')).toBeNull()
  expect(screen.getByRole('link', { name: 'Ver relato' })).toHaveAttribute('href', `/meus-relatos/${item.occurrenceId}`)
  expect(client.getQueryData(['private', user.id, 'notifications', 0])).toMatchObject({ unreadCount: 21 })
  const [, options] = fetchMock.mock.calls.find(([url]) => String(url).includes('/api/notifications'))!
  expect(options?.headers).toMatchObject({ Authorization: 'Bearer synthetic-token' })
  expect(options?.credentials).toBe('omit')
})

test('pagination reaches older items and marks a notification read with one POST', async () => {
  let read = false
  fetchMock.mockImplementation(async (url, options) => {
    if (String(url).endsWith('/auth/me')) return Response.json(user)
    if (options?.method === 'POST') { read = true; return Response.json({ ...item, readAt: '2026-10-15T13:00:00Z' }) }
    const second = String(url).includes('page=1')
    return Response.json({ ...page, page: second ? 1 : 0, unreadCount: read ? 20 : 21, items: [{ ...item, message: second ? 'Notificação antiga' : item.message, readAt: read ? '2026-10-15T13:00:00Z' : null }] })
  })
  mount(); await screen.findByText(item.message)
  await userEvent.click(screen.getByRole('button', { name: 'Próxima' }))
  expect(await screen.findByText('Notificação antiga')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Próxima' })).toBeDisabled()
  await userEvent.click(screen.getByRole('button', { name: 'Marcar como lida' }))
  expect(await screen.findByText('Lida', { exact: true })).toBeVisible()
  expect(await screen.findByRole('link', { name: 'Notificações: 20 não lidas' })).toBeVisible()
  expect(fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1)
  await userEvent.click(screen.getByRole('button', { name: 'Anterior' }))
  expect(await screen.findByText(item.message)).toBeVisible()
})

test('read failure preserves unread state and permits retry', async () => {
  respond(); mount(); await screen.findByText(item.message)
  fetchMock.mockRejectedValueOnce(new TypeError('network'))
  await userEvent.click(screen.getByRole('button', { name: 'Marcar como lida' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível marcar')
  expect(screen.getByText('Não lida', { exact: true })).toBeVisible()
  expect(screen.getByRole('button', { name: 'Marcar como lida' })).toBeEnabled()
})

test('invalid response offers retry and empty success displays zero count', async () => {
  fetchMock.mockImplementation(async url => Response.json(String(url).endsWith('/auth/me') ? user : { invalid: true }))
  mount(); expect(await screen.findByRole('alert')).toHaveTextContent('Não conseguimos atualizar')
  fetchMock.mockResolvedValue(Response.json({ ...page, items: [], totalItems: 0, totalPages: 0, unreadCount: 0 }))
  await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
  expect(await screen.findByText('Você ainda não tem notificações.')).toBeVisible()
  expect(screen.getByRole('link', { name: 'Notificações: 0 não lidas' })).toBeVisible()
})

test.each([403, 401])('HTTP %s obeys session and cache policy', async status => {
  respond(); const { client } = mount(); await screen.findByText(item.message)
  fetchMock.mockResolvedValueOnce(new Response(null, { status }))
  await act(async () => { await client.invalidateQueries({ queryKey: ['private', user.id, 'notifications'] }) })
  if (status === 401) {
    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeVisible()
    await waitFor(() => expect(client.getQueriesData({ queryKey: ['private'] })).toHaveLength(0))
  } else {
    expect(await screen.findByRole('alert')).toHaveTextContent('Não conseguimos atualizar')
    expect(screen.getByRole('heading', { name: 'Notificações' })).toBeVisible()
  }
})

test('anonymous direct access asks for login without notification request', async () => {
  mount('/notificacoes', false)
  expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeVisible()
  expect(fetchMock).not.toHaveBeenCalled()
})

test('notifications poll automatically every 2 minutes and update list and bell', async () => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
  let count = 0
  fetchMock.mockImplementation(async url => {
    if (String(url).endsWith('/auth/me')) return Response.json(user)
    count++
    return Response.json({
      ...page,
      unreadCount: count === 1 ? 21 : 22,
      items: count === 1 ? [item] : [item, { ...item, id: 'd50062d3-9ac2-4e70-86fa-eac5249f4d0c', message: 'Nova notificação periódica' }],
    })
  })
  mount()
  await vi.waitFor(() => expect(screen.getByText(item.message)).toBeVisible())
  expect(screen.getByRole('link', { name: 'Notificações: 21 não lidas' })).toBeVisible()

  expect(count).toBe(1) // The central and bell share the first request.

  // Advance by 2 minutes
  await act(async () => {
    await vi.advanceTimersByTimeAsync(NOTIFICATIONS_REFETCH_INTERVAL + 1000)
  })
  await vi.waitFor(() => expect(screen.getByText('Nova notificação periódica')).toBeVisible())
  expect(screen.getByRole('link', { name: 'Notificações: 22 não lidas' })).toBeVisible()
  expect(count).toBe(2) // One useful request per interval, even with both observers.
})

test('polling stops when the session ends', async () => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
  respond()
  mount()
  await vi.waitFor(() => expect(screen.getByText(item.message)).toBeVisible())

  // Force session expiry (advance past expiresAt: 1800000ms)
  await act(async () => { await vi.advanceTimersByTimeAsync(1800000) })
  const callsAfterExpiry = fetchMock.mock.calls.length

  // Further 2-minute tick should not trigger notification requests
  await act(async () => { await vi.advanceTimersByTimeAsync(NOTIFICATIONS_REFETCH_INTERVAL) })
  expect(fetchMock.mock.calls.length).toBe(callsAfterExpiry)
})

test('bell polls outside the central, pauses with a hidden tab and stops on unmount', async () => {
  vi.useFakeTimers()
  focusManager.setFocused(true)
  let count = 0
  fetchMock.mockImplementation(async url => {
    if (String(url).endsWith('/auth/me')) return Response.json(user)
    count++
    return Response.json({ ...page, unreadCount: count === 1 ? 21 : 22 })
  })
  const { unmount } = mount('/minha-conta')
  await vi.waitFor(() => expect(screen.getByRole('link', { name: 'Notificações: 21 não lidas' })).toBeVisible())
  expect(count).toBe(1)
  await act(async () => { await vi.advanceTimersByTimeAsync(NOTIFICATIONS_REFETCH_INTERVAL + 1000) })
  await vi.waitFor(() => expect(screen.getByRole('link', { name: 'Notificações: 22 não lidas' })).toBeVisible())
  expect(count).toBe(2)
  act(() => focusManager.setFocused(false))
  await act(async () => { await vi.advanceTimersByTimeAsync(NOTIFICATIONS_REFETCH_INTERVAL * 2) })
  expect(count).toBe(2)
  unmount()
  act(() => focusManager.setFocused(true))
  await act(async () => { await vi.advanceTimersByTimeAsync(NOTIFICATIONS_REFETCH_INTERVAL * 2) })
  expect(count).toBe(2)
})

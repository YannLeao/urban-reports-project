import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, afterEach, expect, test, vi } from 'vitest'
import App from '../../App'
import { AuthProvider } from './AuthProvider'
import { STORAGE_KEY, safeReturnPath, useAuth } from './auth'

const person = { id: 'a50062d3-9ac2-4e70-86fa-eac5249f4d0c', name: 'Ana Silva', email: 'ana@example.com', role: 'USER' }
const credential = () => ({ accessToken: 'synthetic-token', expiresAt: new Date(Date.now() + 1800000).toISOString() })
const fetchMock = vi.fn<typeof fetch>()
beforeEach(() => {
  sessionStorage.clear(); fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock); vi.stubEnv('VITE_API_URL', 'https://api.example.com')
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })
function renderPage(path = '/minha-conta', probe = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><AuthProvider>
    <MemoryRouter initialEntries={[path]}><App />{probe && <Probe />}</MemoryRouter>
  </AuthProvider></QueryClientProvider>)
  return client
}
function Probe() {
  const auth = useAuth()
  return <><button onClick={() => { void auth.request('/api/private').catch(() => {}) }}>Consultar privado</button>
    <button onClick={() => { void auth.login('new@example.com', 'synthetic password').catch(() => {}) }}>Outra sessão</button></>
}
function stored() { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(credential())) }
async function fillLogin() {
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText('E-mail'), person.email)
  await user.type(screen.getByLabelText('Senha'), 'synthetic password')
  await user.click(screen.getByRole('button', { name: 'Entrar' }))
  return user
}

test('direct private route requires login; success validates me and stores only credential', async () => {
  fetchMock.mockResolvedValueOnce(Response.json({ ...credential(), tokenType: 'Bearer', user: person }))
    .mockResolvedValueOnce(Response.json(person))
  renderPage()
  await fillLogin()
  expect(await screen.findByRole('heading', { name: 'Minha conta' })).toBeVisible()
  expect(screen.getByText(person.name)).toBeVisible()
  expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: 'omit', method: 'POST', headers: { 'Content-Type': 'application/json' } })
  expect(fetchMock.mock.calls[0][1]?.headers).not.toHaveProperty('Authorization')
  expect(fetchMock.mock.calls[1][1]).toMatchObject({ credentials: 'omit', redirect: 'error', headers: { Authorization: 'Bearer synthetic-token' } })
  expect(Object.keys(JSON.parse(sessionStorage.getItem(STORAGE_KEY)!))).toEqual(['accessToken', 'expiresAt'])
})

test('failed login clears password, gives generic error, focuses summary and never retries', async () => {
  fetchMock.mockResolvedValue(Response.json({ code: 'INVALID_CREDENTIALS' }, { status: 401 }))
  renderPage('/entrar'); await fillLogin()
  expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha incorretos')
  expect(screen.getByLabelText('Senha')).toHaveValue('')
  await waitFor(() => expect(screen.getByRole('alert')).toHaveFocus())
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()
})

test('bootstrap does not expose private content before me; network outage allows retry', async () => {
  stored(); fetchMock.mockRejectedValueOnce(new TypeError('network')).mockResolvedValueOnce(Response.json(person))
  renderPage()
  expect(screen.queryByText(person.name)).not.toBeInTheDocument()
  expect(await screen.findByText(/Não foi possível validar/)).toBeVisible()
  expect(sessionStorage.getItem(STORAGE_KEY)).not.toBeNull()
  await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
  expect(await screen.findByText(person.name)).toBeVisible()
})

test.each([401, 403, 503, 'network'])('private %s handles invalid session separately from denied/unavailable', async (status) => {
  stored(); fetchMock.mockResolvedValueOnce(Response.json(person))
  if (status === 'network') fetchMock.mockRejectedValueOnce(new TypeError('network'))
  else fetchMock.mockResolvedValueOnce(new Response(null, { status: Number(status) }))
  const client = renderPage('/minha-conta', true)
  await screen.findByText(person.name)
  client.setQueryData(['private', person.id, 'reports'], { private: true })
  client.setQueryData(['public'], { public: true })
  await userEvent.click(screen.getByRole('button', { name: 'Consultar privado' }))
  if (status === 401) {
    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeVisible()
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(client.getQueryData(['private', person.id, 'reports'])).toBeUndefined()
  } else {
    expect(screen.getByText(person.name)).toBeVisible()
    expect(sessionStorage.getItem(STORAGE_KEY)).not.toBeNull()
  }
  expect(client.getQueryData(['public'])).toEqual({ public: true })
})

test.each([204, 401])('logout %s confirms end and removes private cache', async (status) => {
  stored(); fetchMock.mockResolvedValueOnce(Response.json(person)).mockResolvedValueOnce(new Response(null, { status }))
  const client = renderPage(); await screen.findByText(person.name)
  client.setQueryData(['private', person.id, 'reports'], ['private'])
  await userEvent.click(screen.getByRole('button', { name: 'Sair' }))
  expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeVisible()
  expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()
  expect(client.getQueryCache().findAll({ queryKey: ['private'] })).toHaveLength(0)
})

test.each([503, 'network'])('logout %s preserves token and permits retry', async (status) => {
  stored(); fetchMock.mockResolvedValueOnce(Response.json(person))
  if (status === 'network') fetchMock.mockRejectedValueOnce(new TypeError('network'))
  else fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }))
  fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
  renderPage(); await screen.findByText(person.name)
  await userEvent.click(screen.getByRole('button', { name: 'Sair' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível confirmar o encerramento')
  expect(sessionStorage.getItem(STORAGE_KEY)).not.toBeNull()
  expect(screen.getByText(person.name)).toBeVisible()
  await userEvent.click(screen.getByRole('button', { name: 'Sair' }))
  expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeVisible()
})

test('expiry ends the session at its absolute deadline without another request', async () => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
  stored(); fetchMock.mockResolvedValue(Response.json(person)); renderPage()
  await act(async () => { await vi.advanceTimersByTimeAsync(0) })
  expect(screen.getByText(person.name)).toBeVisible()
  await act(async () => { await vi.advanceTimersByTimeAsync(1800000) })
  expect(screen.getByRole('heading', { name: 'Entrar' })).toBeVisible()
  expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

test.each([200, 401])('late old-session response %s cannot restore identity or clear a newer session', async (status) => {
  stored()
  let resolve!: (response: Response) => void
  fetchMock.mockResolvedValueOnce(Response.json(person))
    .mockReturnValueOnce(new Promise((done) => { resolve = done }))
    .mockResolvedValueOnce(Response.json({ ...credential(), accessToken: 'new-token', tokenType: 'Bearer', user: person }))
    .mockResolvedValueOnce(Response.json({ ...person, name: 'Outra pessoa' }))
  const client = renderPage('/minha-conta', true); await screen.findByText(person.name)
  client.setQueryData(['private', person.id, 'reports'], ['old'])
  await userEvent.click(screen.getByRole('button', { name: 'Consultar privado' }))
  const signal = fetchMock.mock.calls[1][1]?.signal
  await userEvent.click(screen.getByRole('button', { name: 'Outra sessão' }))
  expect(await screen.findByText('Outra pessoa')).toBeVisible()
  expect(signal?.aborted).toBe(true)
  await act(async () => resolve(Response.json(person, { status })))
  expect(screen.getByText('Outra pessoa')).toBeVisible()
  expect(sessionStorage.getItem(STORAGE_KEY)).toContain('new-token')
  expect(client.getQueryData(['private', person.id, 'reports'])).toBeUndefined()
})

test('storage unavailable still permits a memory session', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
  fetchMock.mockResolvedValueOnce(Response.json({ ...credential(), tokenType: 'Bearer', user: person })).mockResolvedValueOnce(Response.json(person))
  renderPage('/entrar'); await fillLogin()
  expect(await screen.findByText(person.name)).toBeVisible()
})

test.each(['https://evil.example', '//evil.example', '/\\evil', '/%2f%2fevil', '/%5cevil', '/entrar', '/cadastro', '/x?token=secret', '\n/evil'])('rejects unsafe return %s', (path) => {
  expect(safeReturnPath(path)).toBe('/minha-conta')
})
test('preserves an internal route', () => { expect(safeReturnPath('/future/private')).toBe('/future/private') })

test('pending login disables submit and does not retry or submit twice', async () => {
  let resolve!: (response: Response) => void
  fetchMock.mockReturnValueOnce(new Promise((done) => { resolve = done }))
  renderPage('/entrar'); await fillLogin()
  const button = screen.getByRole('button', { name: 'Entrando…' })
  expect(button).toBeDisabled()
  await userEvent.dblClick(button)
  expect(fetchMock).toHaveBeenCalledTimes(1)
  await act(async () => resolve(Response.json({ code: 'INVALID_CREDENTIALS' }, { status: 401 })))
  expect(screen.getByLabelText('Senha')).toHaveValue('')
})

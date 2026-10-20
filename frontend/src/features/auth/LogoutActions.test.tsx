import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, expect, test, vi } from 'vitest'
import App from '../../App'
import { AuthProvider } from './AuthProvider'
import { STORAGE_KEY } from './auth'

const person = { id: 'a50062d3-9ac2-4e70-86fa-eac5249f4d0c', name: 'Pessoa sintética', email: 'inspection@example.com', role: 'SUPER_ADMIN' }
const fetchMock = vi.fn<typeof fetch>()
beforeEach(() => {
  sessionStorage.clear()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('VITE_API_URL', 'https://api.example.com')
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ accessToken: 'synthetic-token', expiresAt: new Date(Date.now() + 1800000).toISOString() }))
})

async function mount(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><AuthProvider><MemoryRouter initialEntries={[path]}><App /></MemoryRouter></AuthProvider></QueryClientProvider>)
  await screen.findByRole('button', { name: 'Sair' })
  client.setQueryData(['private', person.id, 'test'], ['private'])
  client.setQueryData(['public', 'test'], ['public'])
  return client
}

for (const path of ['/', '/minha-conta']) {
  test.each([204, 401])(`logout at ${path} with %s ends the session and clears only private cache`, async status => {
    fetchMock.mockResolvedValueOnce(Response.json(person)).mockResolvedValueOnce(new Response(null, { status }))
    const client = await mount(path)
    await userEvent.click(screen.getByRole('button', { name: 'Sair' }))
    await waitFor(() => expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull())
    expect(client.getQueryCache().findAll({ queryKey: ['private'] })).toHaveLength(0)
    expect(client.getQueryData(['public', 'test'])).toEqual(['public'])
    if (path === '/') expect(await screen.findByRole('link', { name: 'Relatar problema' })).toBeVisible()
    else expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeVisible()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  test.each([503, 'network'])(`logout at ${path} with %s focuses error, preserves session and retries manually`, async failure => {
    fetchMock.mockResolvedValueOnce(Response.json(person))
    if (failure === 'network') fetchMock.mockRejectedValueOnce(new TypeError('synthetic network failure'))
    else fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }))
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    const client = await mount(path)
    await userEvent.click(screen.getByRole('button', { name: 'Sair' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Não foi possível confirmar o encerramento da sessão. Tente sair novamente.')
    await waitFor(() => expect(alert).toHaveFocus())
    expect(sessionStorage.getItem(STORAGE_KEY)).toContain('synthetic-token')
    expect(client.getQueryData(['private', person.id, 'test'])).toEqual(['private'])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await userEvent.click(screen.getByRole('button', { name: 'Sair' }))
    await waitFor(() => expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull())
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  test(`logout at ${path} is busy and prevents duplicate click/Enter while pending`, async () => {
    let resolve!: (response: Response) => void
    fetchMock.mockResolvedValueOnce(Response.json(person)).mockReturnValueOnce(new Promise(done => { resolve = done }))
    await mount(path)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Sair' }))
    const button = screen.getByRole('button', { name: /Saindo…/ })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    await user.dblClick(button)
    await user.keyboard('{Enter}{Enter}')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await act(async () => resolve(new Response(null, { status: 503 })))
    expect(await screen.findByRole('button', { name: 'Sair' })).toBeEnabled()
  })
}

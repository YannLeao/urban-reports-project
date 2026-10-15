import { withEmptyNotifications } from '../test/notification-fixture'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, expect, test, vi } from 'vitest'
import App from '../App'
import { AuthProvider } from '../features/auth/AuthProvider'
import { STORAGE_KEY } from '../features/auth/auth'
import { occurrenceReportSchema, preciseSeconds, reportKey, resolutionDuration } from '../features/administration/occurrence-report'

const fetchMock = vi.fn<typeof fetch>()
const user = { id: 'a50062d3-9ac2-4e70-86fa-eac5249f4d0c', name: 'Pessoa administradora', email: 'admin@example.com', role: 'ADMIN' }
const reference = {
  total: 6,
  categories: [{ categoryId: 1, categoryName: 'Iluminação pública', count: 3 }, { categoryId: 2, categoryName: 'Buraco ou pavimentação', count: 3 }],
  statuses: [{ status: 'PENDING', count: 1 }, { status: 'IN_ANALYSIS', count: 1 }, { status: 'RESOLVED', count: 2 }, { status: 'REJECTED', count: 2 }],
  localities: [{ locality: 'Centro', count: 3 }, { locality: 'Bairro A', count: 2 }, { locality: null, count: 1 }],
  averageResolutionSeconds: 14400, resolvedSampleSize: 2, resolvedWithoutValidDuration: 0,
  rejectedPercentage: 100 / 3, generatedAt: '2026-10-15T12:00:00Z',
}
const empty = { ...reference, total: 0, categories: reference.categories.map(item => ({ ...item, count: 0 })), statuses: reference.statuses.map(item => ({ ...item, count: 0 })), localities: [], averageResolutionSeconds: null, resolvedSampleSize: 0, rejectedPercentage: null }
beforeEach(() => {
  sessionStorage.clear(); fetchMock.mockReset(); vi.stubGlobal('fetch', withEmptyNotifications(fetchMock)); vi.stubEnv('VITE_API_URL', 'https://api.example.com')
})
function mount(authenticated = true) {
  if (authenticated) sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ accessToken: 'synthetic-session', expiresAt: new Date(Date.now() + 1800000).toISOString() }))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(<QueryClientProvider client={client}><AuthProvider><MemoryRouter initialEntries={['/administracao/relatorio']}><App /></MemoryRouter></AuthProvider></QueryClientProvider>)
  return { client, ...view }
}
function respond(data: unknown = reference) {
  fetchMock.mockImplementation(async url => Response.json(String(url).endsWith('/auth/me') ? user : data))
}

test('direct route renders reference calculations, textual distributions and all localities without HTML execution', async () => {
  const data = { ...reference, localities: [...reference.localities.slice(0, 2), { locality: '<img src=x onerror=alert(1)>', count: 1 }] }
  respond(data)
  const { client, container } = mount()
  expect(await screen.findByText('4 h')).toBeVisible()
  expect(within(screen.getByRole('region', { name: 'Total de relatos' })).getByText('6')).toBeVisible()
  expect(screen.getByText('33,3%')).toBeVisible()
  await userEvent.click(screen.getByText('Como os indicadores são calculados'))
  expect(screen.getByText('Valor em segundos: 14.400 segundos.')).toBeVisible()
  expect(screen.getByRole('rowheader', { name: '<img src=x onerror=alert(1)>' })).toBeVisible()
  expect(container.querySelector('table img')).toBeNull()
  expect(screen.getAllByText('3 relatos')).toHaveLength(2)
  expect(client.getQueryData(reportKey(user.id))).toMatchObject({ total: 6 })
  expect(screen.getByRole('link', { name: 'Relatório' })).toHaveAttribute('aria-current', 'page')
  const [, options] = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/reports/occurrences'))!
  expect(options?.headers).toMatchObject({ Authorization: 'Bearer synthetic-session' })
  expect(options?.credentials).toBe('omit')
})

test('empty dataset shows explicit empty distributions and null metrics', async () => {
  respond(empty); mount()
  expect(await screen.findByText('Nenhum relato disponível. Sem dados para as distribuições.')).toBeVisible()
  expect(screen.getAllByText('Sem dados')).toHaveLength(2)
  expect(within(screen.getByRole('region', { name: 'Total de relatos' })).getByText('0')).toBeVisible()
  expect(screen.getByText('Sem dados de localidades.')).toBeVisible()
})

test.each([0, 0.125, 172800])('real duration %s and zero rejected remain data', async seconds => {
  respond({ ...reference, statuses: reference.statuses.map(item => ({ ...item, count: item.status === 'RESOLVED' ? 6 : 0 })), averageResolutionSeconds: seconds, resolvedSampleSize: 6, rejectedPercentage: 0 })
  mount()
  expect(await screen.findByText(resolutionDuration(seconds))).toBeVisible()
  expect(screen.getByText('0%')).toBeVisible()
  expect(screen.queryByText('Sem dados')).not.toBeInTheDocument()
  expect(preciseSeconds(0.0000001)).not.toBe('0 segundos')
})

test.each([null, 7200])('invalid resolution histories show sample sizes and partial warning (mean %s)', async average => {
  respond({ ...reference, averageResolutionSeconds: average, resolvedSampleSize: average === null ? 0 : 1, resolvedWithoutValidDuration: average === null ? 2 : 1 })
  mount()
  expect(await screen.findByText(/Média parcial:/)).toHaveTextContent(average === null ? '0 resolvidas consideradas e 2 excluídas' : '1 resolvidas consideradas e 1 excluídas')
  expect(screen.getByText(average === null ? 'Sem dados' : '2 h')).toBeVisible()
})

test('initial network failure offers retry and never fills metrics with false zeros', async () => {
  fetchMock.mockResolvedValueOnce(Response.json(user)).mockRejectedValueOnce(new TypeError('network')).mockResolvedValueOnce(Response.json(reference))
  mount()
  expect(await screen.findByRole('alert')).toHaveTextContent('Não conseguimos carregar o relatório')
  expect(screen.queryByRole('region', { name: 'Total de relatos' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
  expect(await screen.findByText('4 h')).toBeVisible()
})

test('failed refresh preserves existing data, marks it stale, then can recover', async () => {
  respond(); mount(); await screen.findByText('4 h')
  fetchMock.mockRejectedValueOnce(new TypeError('network'))
  await userEvent.click(screen.getByRole('button', { name: 'Atualizar relatório' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Os dados abaixo não foram atualizados')
  expect(screen.getByText('4 h')).toBeVisible()
  await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
})

test('keyboard refresh retains focus and prevents another request while pending', async () => {
  respond(); mount(); await screen.findByText('4 h')
  let resolve!: (response: Response) => void
  fetchMock.mockImplementationOnce(() => new Promise<Response>(done => { resolve = done }))
  const button = screen.getByRole('button', { name: 'Atualizar relatório' })
  button.focus()
  await userEvent.keyboard('{Enter}')
  expect(button).toHaveFocus()
  expect(button).toHaveAttribute('aria-disabled', 'true')
  const requests = fetchMock.mock.calls.length
  await userEvent.keyboard('{Enter}')
  expect(fetchMock).toHaveBeenCalledTimes(requests)
  await act(async () => resolve(Response.json(reference)))
  await waitFor(() => expect(button).toHaveAttribute('aria-disabled', 'false'))
  expect(button).toHaveFocus()
})

test.each(['USER', 'SUPER_ADMIN'])('%s cannot open the report or see its navigation', async role => {
  fetchMock.mockResolvedValue(Response.json({ ...user, role })); mount()
  expect(await screen.findByRole('heading', { name: 'Acesso restrito' })).toBeVisible()
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('link', { name: 'Relatório' })).not.toBeInTheDocument()
})

test('anonymous direct route requests login', async () => {
  mount(false)
  expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeVisible()
  expect(fetchMock).not.toHaveBeenCalled()
})

test.each([401, 403])('refresh denied with %s removes report data from UI and private cache', async status => {
  respond(); const { client } = mount(); await screen.findByText('4 h')
  fetchMock.mockResolvedValueOnce(new Response(null, { status }))
  await userEvent.click(screen.getByRole('button', { name: 'Atualizar relatório' }))
  if (status === 401) {
    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeVisible()
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()
  } else {
    expect(await screen.findByRole('alert')).toHaveTextContent('Acesso negado')
    expect(sessionStorage.getItem(STORAGE_KEY)).not.toBeNull()
  }
  expect(screen.queryByText('4 h')).not.toBeInTheDocument()
  await waitFor(() => expect(client.getQueryData(reportKey(user.id))).toBeUndefined())
})

test('pending report uses cancellation and cannot populate another user cache', async () => {
  let resolve!: (response: Response) => void
  fetchMock.mockResolvedValueOnce(Response.json(user)).mockImplementationOnce(() => new Promise<Response>(done => { resolve = done }))
  const { client, unmount } = mount()
  await screen.findByText('Atualizando relatório…')
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  const signal = fetchMock.mock.calls[1][1]?.signal
  unmount()
  expect(signal?.aborted).toBe(true)
  await act(async () => resolve(Response.json(reference)))
  expect(client.getQueryCache().findAll({ queryKey: ['private'] })).toHaveLength(0)
})

test('schema rejects missing fields, wrong nullable metrics, impossible counts and nonfinite numbers', () => {
  expect(occurrenceReportSchema.safeParse(reference).success).toBe(true)
  expect(occurrenceReportSchema.safeParse(empty).success).toBe(true)
  for (const bad of [{ ...reference, total: undefined }, { ...reference, averageResolutionSeconds: null },
    { ...reference, averageResolutionSeconds: Infinity }, { ...reference, rejectedPercentage: 101 },
    { ...empty, rejectedPercentage: 0 }, { ...reference, resolvedWithoutValidDuration: 1 },
    { ...reference, statuses: [] }, { ...reference, categories: [] }, { ...reference, localities: [] }]) {
    expect(occurrenceReportSchema.safeParse(bad).success).toBe(false)
  }
})

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter } from 'react-router'
import { beforeEach, expect, test, vi } from 'vitest'
import App from '../App'
import { AuthProvider } from '../features/auth/AuthProvider'
import { STORAGE_KEY, userSchema } from '../features/auth/auth'
import { adminPageSchema } from '../features/administration/administration'

const fetchMock = vi.fn<typeof fetch>()
const user = { id: 'a50062d3-9ac2-4e70-86fa-eac5249f4d0c', name: 'Responsável', email: 'root@example.com', role: 'SUPER_ADMIN' }
const admin = { id: 'b50062d3-9ac2-4e70-86fa-eac5249f4d0c', name: 'Pessoa administradora', email: 'admin@example.com', status: 'PENDING_ACTIVATION', createdAt: '2026-10-15T12:00:00Z' }
const report = { id: '3e85aa3d-19e3-42a3-8861-c435ff5908af', categoryId: 1, categoryName: 'Iluminação pública', title: 'Poste apagado na praça', description: null, neighborhood: 'Centro', reference: 'Praça central', status: 'PENDING', version: 0, createdAt: '2026-10-15T12:00:00Z' }
const token = 'a'.repeat(43)
beforeEach(() => {
  sessionStorage.clear(); window.history.replaceState({}, '', '/')
  fetchMock.mockReset(); vi.stubGlobal('fetch', (url: Parameters<typeof fetch>[0], init?: RequestInit) => String(url).endsWith('/api/public/occurrence-categories') ? Promise.resolve(Response.json([{ id: 1, name: 'Iluminação pública' }, { id: 2, name: 'Buraco ou pavimentação' }])) : fetchMock(url, init)); vi.stubEnv('VITE_API_URL', 'https://api.example.com')
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} })
  vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: vi.fn(() => 'blob:photo'), revokeObjectURL: vi.fn() }))
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new Event('close')) }
})
function renderPage(path: string, authenticated = true) {
  if (authenticated) sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ accessToken: 'synthetic-session', expiresAt: new Date(Date.now() + 1800000).toISOString() }))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(<QueryClientProvider client={client}><AuthProvider><MemoryRouter initialEntries={[path]}><App /></MemoryRouter></AuthProvider></QueryClientProvider>)
  return { client, ...view }
}
const page = <T,>(items: T[]) => ({ items, page: 0, size: 20, totalItems: items.length, totalPages: items.length ? 1 : 0 })

test('role schemas reject unknown values and guards use exact roles', async () => {
  expect(userSchema.safeParse({ ...user, role: 'ROOT' }).success).toBe(false)
  expect(adminPageSchema.safeParse(page([{ ...admin, status: 'UNKNOWN' }])).success).toBe(false)
  fetchMock.mockResolvedValueOnce(Response.json({ ...user, role: 'ADMIN' }))
  renderPage('/administracao/contas')
  expect(await screen.findByRole('heading', { name: 'Acesso restrito' })).toBeVisible()
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('link', { name: 'Administradores' })).not.toBeInTheDocument()
})

test('SUPER_ADMIN has no moderation or citizen creation route', async () => {
  fetchMock.mockResolvedValueOnce(Response.json(user))
  renderPage('/administracao/relatos')
  expect(await screen.findByRole('heading', { name: 'Acesso restrito' })).toBeVisible()
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

test('account creation distinguishes mail failure, blocks repeat and refreshes scoped list', async () => {
  let resolve!: (response: Response) => void
  let created = false
  fetchMock.mockImplementation(async (url, options) => {
    if (String(url).endsWith('/auth/me')) return Response.json(user)
    if (options?.method === 'POST') return new Promise<Response>(done => { resolve = done })
    return Response.json(page(created ? [admin] : []))
  })
  const { client } = renderPage('/administracao/contas')
  await screen.findByText('Nenhum administrador nesta página.')
  expect(screen.getByLabelText('Nome do administrador')).not.toBeVisible()
  await userEvent.click(screen.getByRole('button', { name: 'Criar administrador' }))
  expect(screen.getByLabelText('Nome do administrador')).toHaveFocus()
  fireEvent.change(screen.getByLabelText('Nome do administrador'), { target: { value: admin.name } })
  fireEvent.change(screen.getByLabelText('E-mail do administrador'), { target: { value: admin.email } })
  const form = screen.getByRole('button', { name: 'Enviar convite' }).closest('form')!
  fireEvent.submit(form); fireEvent.submit(form)
  expect(fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1)
  expect(screen.getByLabelText('Nome do administrador')).toBeDisabled()
  created = true
  await act(async () => resolve(Response.json({ admin, mailStatus: 'FAILED' }, { status: 201 })))
  expect(await screen.findByText(/O envio do convite falhou/)).toBeVisible()
  expect(await screen.findByRole('button', { name: `Reenviar convite para ${admin.email}` })).toBeVisible()
  expect(client.getQueryData(['private', user.id, 'admins', 'list', 0])).toMatchObject({ items: [admin] })
})

test('moderation page survives detail navigation and return without changing queue order or request size', async () => {
  fetchMock.mockImplementation(async url => {
    const path = String(url)
    if (path.endsWith('/auth/me')) return Response.json({ ...user, role: 'ADMIN' })
    if (path.includes('/occurrences?')) return Response.json({ ...page([report]), page: 1, totalPages: 2, totalItems: 21 })
    return Response.json({ report, history: [] })
  })
  renderPage('/administracao/relatos?pagina=2')
  expect(await screen.findByText('Página 2 de 2')).toBeVisible()
  expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/admin/occurrences?page=1&size=20&scope=QUEUE'))).toBe(true)
  await userEvent.click(screen.getByRole('link', { name: `Analisar relato: ${report.title}` }))
  const back = await screen.findByRole('link', { name: '← Voltar para a fila' })
  expect(back).toHaveAttribute('href', '/administracao/relatos?pagina=2')
  await userEvent.click(back)
  expect(await screen.findByText('Página 2 de 2')).toBeVisible()
})

test('occupied email is explained and does not claim a promotion', async () => {
  fetchMock.mockResolvedValueOnce(Response.json(user)).mockResolvedValueOnce(Response.json(page([])))
    .mockResolvedValueOnce(Response.json({ code: 'EMAIL_ALREADY_REGISTERED' }, { status: 409 })).mockResolvedValueOnce(Response.json(page([])))
  renderPage('/administracao/contas')
  await screen.findByText('Nenhum administrador nesta página.')
  await userEvent.click(screen.getByRole('button', { name: 'Criar administrador' }))
  fireEvent.change(screen.getByLabelText('Nome do administrador'), { target: { value: admin.name } })
  fireEvent.change(screen.getByLabelText('E-mail do administrador'), { target: { value: admin.email } })
  await userEvent.click(screen.getByRole('button', { name: 'Enviar convite' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Contas existentes não podem ser promovidas')
})

test('resend and confirmed deactivation keep identity and accessible focus', async () => {
  let status = 'PENDING_ACTIVATION'
  fetchMock.mockImplementation(async (url, options) => {
    if (String(url).endsWith('/auth/me')) return Response.json(user)
    if (String(url).endsWith('/activation-resends')) return Response.json({ admin, mailStatus: 'ACCEPTED' })
    if (options?.method === 'POST') { status = 'DISABLED'; return Response.json({ ...admin, status }) }
    return Response.json(page([{ ...admin, status }]))
  })
  renderPage('/administracao/contas')
  await userEvent.click(await screen.findByRole('button', { name: `Reenviar convite para ${admin.email}` }))
  expect(await screen.findByText(/Isso não confirma o recebimento/)).toBeVisible()
  await userEvent.click(screen.getByRole('button', { name: `Desativar ${admin.email}` }))
  expect(screen.getByRole('dialog')).toHaveTextContent(admin.email)
  expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus()
  await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
  expect(screen.getByRole('button', { name: `Desativar ${admin.email}` })).toHaveFocus()
  await userEvent.click(screen.getByRole('button', { name: `Desativar ${admin.email}` }))
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirmar desativação' }))
  expect(await screen.findByText('Desativado')).toBeVisible()
  expect(screen.queryByRole('button', { name: `Reenviar convite para ${admin.email}` })).not.toBeInTheDocument()
})

test('activation captures fragment, does not consume on GET and submits only once without session', async () => {
  window.history.replaceState({}, '', `/ativar-administrador#token=${token}`)
  let resolve!: (response: Response) => void
  fetchMock.mockImplementation(() => new Promise<Response>(done => { resolve = done }))
  renderPage('/ativar-administrador', false)
  expect(window.location.hash).toBe(''); expect(fetchMock).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'synthetic valid password phrase' } })
  fireEvent.change(screen.getByLabelText('Confirme a senha'), { target: { value: 'synthetic valid password phrase' } })
  const form = screen.getByRole('button', { name: 'Ativar conta' }).closest('form')!
  fireEvent.submit(form); fireEvent.submit(form)
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fetchMock.mock.calls[0][1]?.headers).toEqual({ 'Content-Type': 'application/json' })
  expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()
  await act(async () => resolve(Response.json({ activated: true })))
  expect(await screen.findByText(/Conta ativada/)).toBeVisible()
  expect(screen.getAllByRole('link', { name: 'Entrar' }).find(link => link.closest('main'))!).toBeVisible()
  expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()
})

test('invalid link and activation server errors do not reveal internal details', async () => {
  window.history.replaceState({}, '', `/ativar-administrador#token=${token}`)
  fetchMock.mockResolvedValue(Response.json({ code: 'INVALID_ACTIVATION_LINK', message: 'private details' }, { status: 400 }))
  renderPage('/ativar-administrador', false)
  for (const label of ['Senha', 'Confirme a senha']) fireEvent.change(screen.getByLabelText(label), { target: { value: 'synthetic valid password phrase' } })
  await userEvent.click(screen.getByRole('button', { name: 'Ativar conta' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Link inválido ou expirado')
  expect(screen.getByLabelText('Senha')).toHaveValue('')
  expect(screen.getByRole('alert')).not.toHaveTextContent('private details')
})

test('moderation rejects with Unicode count and reloads conflicts without false success', async () => {
  let current = { ...report }
  let history: object[] = []
  let conflict = true
  fetchMock.mockImplementation(async (url, options) => {
    if (String(url).endsWith('/auth/me')) return Response.json({ ...user, role: 'ADMIN' })
    if (String(url).endsWith('/image')) return new Response('photo', { headers: { 'Content-Type': 'image/png' } })
    if (options?.method === 'POST') {
      if (conflict) { conflict = false; current = { ...current, status: 'ACCEPTED', version: 1 }; return Response.json({ code: 'VERSION_CHANGED' }, { status: 412 }) }
      current = { ...current, status: 'RESOLVED', version: 2 }
      history = [{ id: admin.id, previousStatus: 'ACCEPTED', newStatus: 'RESOLVED', occurredAt: admin.createdAt, responsible: admin.name, reason: null }]
    }
    return Response.json({ report: current, history })
  })
  const { client } = renderPage(`/administracao/relatos/${report.id}`)
  client.setQueryData(['private', user.id, 'occurrence-report'], { total: 1 })
  const filteredKeys = [
    ['private', user.id, 'moderation', 'list', { page: 0, size: 20, categoryId: 1, status: 'PENDING', scope: 'QUEUE' }],
    ['private', user.id, 'moderation', 'list', { page: 1, size: 20, categoryId: 2, status: 'RESOLVED', scope: 'ALL' }],
    ['private', user.id, 'occurrences', 'list', { categoryId: 1, status: 'PENDING' }],
    ['private', user.id, 'occurrences', 'markers', { categoryId: 2, status: 'ACCEPTED' }],
    ['public', 'occurrences', 'list', { page: 1, size: 20, categoryId: 2, status: 'RESOLVED' }],
    ['public', 'occurrences', 'markers', { categoryId: 1, status: 'PENDING' }],
  ]
  filteredKeys.forEach(key => client.setQueryData(key, { synthetic: true }))
  await userEvent.click(await screen.findByRole('button', { name: 'Rejeitar' }))
  const reason = await screen.findByLabelText('Motivo da rejeição')
  fireEvent.change(reason, { target: { value: '😀'.repeat(9) } })
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar rejeição' }))
  expect(fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(0)
  expect(reason).toHaveFocus()
  fireEvent.change(reason, { target: { value: '😀'.repeat(10) } })
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar rejeição' }))
  const first = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST')!
  expect(JSON.parse(first[1]?.body as string)).toEqual({ target: 'REJECTED', reason: '😀'.repeat(10) })
  expect(new Headers(first[1]?.headers).get('If-Match')).toBe('"0"')
  expect(await screen.findByRole('alert')).toHaveTextContent('Este relato mudou')
  expect(screen.queryByText('Estado atualizado.')).not.toBeInTheDocument()
  expect(await screen.findByRole('button', { name: 'Resolver' })).toBeVisible()
  await userEvent.click(screen.getByRole('button', { name: 'Resolver' }))
  await waitFor(() => expect(fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(2))
  const last = fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST').at(-1)!
  expect(JSON.parse(last[1]?.body as string)).toEqual({ target: 'RESOLVED', reason: null })
  expect(new Headers(last[1]?.headers).get('If-Match')).toBe('"1"')
  expect(await screen.findByText('Estado atualizado.')).toBeVisible()
})

test.each([
  { action: 'Aceitar', label: 'Comentário de encaminhamento', confirmation: 'Confirmar aceitação', target: 'ACCEPTED', statusLabel: 'Aceita' },
  { action: 'Rejeitar', label: 'Motivo da rejeição', confirmation: 'Confirmar rejeição', target: 'REJECTED', statusLabel: 'Rejeitada' },
])('$action sends its own target and reloads the saved state and comment', async ({ action, label, confirmation, target, statusLabel }) => {
  let current = { ...report }
  const history: object[] = []
  fetchMock.mockImplementation(async (url, options) => {
    if (String(url).endsWith('/auth/me')) return Response.json({ ...user, role: 'ADMIN' })
    if (String(url).endsWith('/image')) return new Response('photo', { headers: { 'Content-Type': 'image/png' } })
    if (options?.method === 'POST') {
      current = { ...current, status: target, version: 1 }
      history.push({ id: admin.id, previousStatus: 'PENDING', newStatus: target, occurredAt: admin.createdAt, responsible: admin.name, reason: 'Comentário persistido sintético' })
    }
    return Response.json({ report: current, history })
  })
  const firstView = renderPage(`/administracao/relatos/${report.id}`)
  await userEvent.click(await screen.findByRole('button', { name: action }))
  expect(await screen.findByLabelText(label)).toHaveFocus()
  await userEvent.click(screen.getByRole('button', { name: confirmation }))
  expect(fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(0)
  fireEvent.change(screen.getByLabelText(label), { target: { value: '  Comentário persistido sintético  ' } })
  await userEvent.click(screen.getByRole('button', { name: confirmation }))
  await screen.findByText('Estado atualizado.')
  const posts = fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST')
  expect(posts).toHaveLength(1)
  expect(JSON.parse(posts[0][1]?.body as string)).toEqual({ target, reason: 'Comentário persistido sintético' })
  expect(new Headers(posts[0][1]?.headers).get('If-Match')).toBe('"0"')
  firstView.unmount()
  renderPage(`/administracao/relatos/${report.id}`)
  expect(await screen.findByText(statusLabel, { selector: 'span' })).toBeVisible()
  expect(await screen.findByText('Comentário: Comentário persistido sintético')).toBeVisible()
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
})

test('cancelling clears the decision and comment before choosing another action', async () => {
  fetchMock.mockImplementation(async url => String(url).endsWith('/auth/me')
    ? Response.json({ ...user, role: 'ADMIN' }) : String(url).endsWith('/image')
      ? new Response('photo', { headers: { 'Content-Type': 'image/png' } }) : Response.json({ report, history: [] }))
  renderPage(`/administracao/relatos/${report.id}`)
  const accept = await screen.findByRole('button', { name: 'Aceitar' })
  await userEvent.click(accept)
  fireEvent.change(screen.getByLabelText('Comentário de encaminhamento'), { target: { value: 'Rascunho descartado' } })
  await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
  await waitFor(() => expect(accept).toHaveFocus())
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Rejeitar' }))
  expect(screen.getByLabelText('Motivo da rejeição')).toHaveValue('')
  expect(fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(0)
})

test('changing report discards the previous decision, validation error and comment', async () => {
  const other = { ...report, id: admin.id, title: 'Outro relato sintético' }
  fetchMock.mockImplementation(async url => String(url).endsWith('/auth/me')
    ? Response.json({ ...user, role: 'ADMIN' }) : String(url).endsWith('/image')
      ? new Response('photo', { headers: { 'Content-Type': 'image/png' } })
      : Response.json({ report: String(url).endsWith(other.id) ? other : report, history: [] }))
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ accessToken: 'synthetic-session', expiresAt: new Date(Date.now() + 1800000).toISOString() }))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><AuthProvider><MemoryRouter initialEntries={[`/administracao/relatos/${report.id}`]}>
    <Link to={`/administracao/relatos/${other.id}`}>Trocar de relato</Link><App />
  </MemoryRouter></AuthProvider></QueryClientProvider>)
  await userEvent.click(await screen.findByRole('button', { name: 'Aceitar' }))
  fireEvent.change(screen.getByLabelText('Comentário de encaminhamento'), { target: { value: 'curto' } })
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar aceitação' }))
  expect(screen.getByText('Informe um comentário de 10 a 500 caracteres.')).toBeVisible()
  await userEvent.click(screen.getByRole('link', { name: 'Trocar de relato' }))
  await screen.findByRole('heading', { name: other.title })
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Rejeitar' }))
  expect(screen.getByLabelText('Motivo da rejeição')).toHaveValue('')
  expect(screen.queryByText('Informe um comentário de 10 a 500 caracteres.')).not.toBeInTheDocument()
  expect(fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(0)
})

test.each(['/administracao/contas', '/administracao/relatos'])('revoked session at %s removes all private cache', async path => {
  fetchMock.mockResolvedValueOnce(Response.json({ ...user, role: path.endsWith('contas') ? 'SUPER_ADMIN' : 'ADMIN' })).mockResolvedValueOnce(new Response(null, { status: 401 }))
  const { client } = renderPage(path)
  expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeVisible()
  await waitFor(() => expect(client.getQueryCache().findAll({ queryKey: ['private'] })).toHaveLength(0))
  expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()
})

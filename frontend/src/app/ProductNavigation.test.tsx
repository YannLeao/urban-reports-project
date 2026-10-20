import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, expect, test, vi } from 'vitest'
import App from '../App'
import { AuthProvider } from '../features/auth/AuthProvider'
import { STORAGE_KEY } from '../features/auth/auth'

const fetchMock = vi.fn<typeof fetch>()
const user = { id: 'a50062d3-9ac2-4e70-86fa-eac5249f4d0c', name: 'Ana', email: 'ana@example.com', role: 'USER' }
beforeEach(() => { sessionStorage.clear(); fetchMock.mockReset(); vi.stubGlobal('fetch', (url: Parameters<typeof fetch>[0], init?: RequestInit) => String(url).endsWith('/api/public/occurrence-categories') ? Promise.resolve(Response.json([{ id: 1, name: 'Iluminação pública' }, { id: 2, name: 'Buraco ou pavimentação' }])) : fetchMock(url, init)); vi.stubEnv('VITE_API_URL', 'https://api.example.com') })
function mount(path = '/', role?: string) {
  if (role) sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ accessToken: 'synthetic-token', expiresAt: new Date(Date.now() + 1800000).toISOString() }))
  fetchMock.mockResolvedValue(Response.json({ ...user, role }))
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AuthProvider><MemoryRouter initialEntries={[path]}><App /></MemoryRouter></AuthProvider></QueryClientProvider>)
}
test.each([
  ['USER', ['Mapa', 'Relatar', 'Meus relatos', 'Conta'], ['Fila', 'Relatório', 'Administradores', 'Entrar']],
  ['ADMIN', ['Fila', 'Relatório', 'Conta'], ['Relatar', 'Meus relatos', 'Administradores']],
  ['SUPER_ADMIN', ['Administradores', 'Conta'], ['Fila', 'Relatório', 'Relatar', 'Meus relatos']],
])('navigation and home for %s respect the exact role', async (role, allowed, absent) => {
  mount('/', role)
  await screen.findByRole('link', { name: 'Conta' })
  const nav = within(screen.getByRole('navigation', { name: 'Navegação principal' }))
  for (const name of allowed) expect(nav.getByRole('link', { name })).toBeVisible()
  for (const name of absent) expect(nav.queryByRole('link', { name })).toBeNull()
  expect(screen.queryByRole('link', { name: 'Criar conta' })).toBeNull()
  if (role !== 'USER') expect(screen.queryByRole('link', { name: 'Relatar problema' })).toBeNull()
  else {
    expect(screen.getByRole('link', { name: /^Notificações/ })).toHaveAttribute('href', '/notificacoes')
  }
  const main = within(screen.getByRole('main'))
  if (role === 'SUPER_ADMIN') {
    expect(main.getAllByRole('button')).toHaveLength(1)
    expect(main.getByRole('button', { name: 'Sair' })).toBeVisible()
    expect(main.queryAllByRole('link')).toHaveLength(0)
    expect(nav.getByRole('link', { name: 'Administradores' })).toHaveAttribute('href', '/administracao/contas')
  } else {
    expect(main.getByRole('link', { name: 'Ver no mapa' })).toHaveAttribute('href', '/ocorrencias?visao=mapa')
    if (role === 'ADMIN') expect(main.getByRole('link', { name: 'Abrir moderação' })).toHaveAttribute('href', '/administracao/relatos')
  }
})

test.each([
  ['USER', ['Notificações', 'Registrar problema', 'Meus relatos']],
  ['ADMIN', ['Moderar relatos']],
  ['SUPER_ADMIN', []],
] as const)('account preserves data and exact shortcuts for %s', async (role, shortcuts) => {
  mount('/minha-conta', role)
  await screen.findByRole('heading', { name: 'Minha conta' })
  const main = within(screen.getByRole('main'))
  expect(main.getByText(user.name)).toBeVisible()
  expect(main.getByText(user.email)).toBeVisible()
  expect(main.getByRole('button', { name: 'Sair' })).toBeVisible()
  expect(main.getAllByRole('term').map(item => item.textContent)).toEqual(['Nome', 'E-mail'])
  expect(main.queryAllByRole('link').map(item => item.textContent)).toEqual(shortcuts)
})

test('SUPER_ADMIN reaches management and account through the navbar', async () => {
  mount('/', 'SUPER_ADMIN')
  const nav = within(screen.getByRole('navigation', { name: 'Navegação principal' }))
  await userEvent.click(await nav.findByRole('link', { name: 'Administradores' }))
  expect(await screen.findByRole('heading', { name: 'Administradores' })).toBeVisible()
  await userEvent.click(nav.getByRole('link', { name: 'Conta' }))
  expect(await screen.findByRole('heading', { name: 'Minha conta' })).toBeVisible()
  expect(screen.queryByRole('link', { name: 'Gerenciar administradores' })).toBeNull()
})
test('visitor reporting intent survives login and uses the guarded registration route', async () => {
  mount()
  await userEvent.click(screen.getByRole('link', { name: 'Relatar problema' }))
  await screen.findByRole('heading', { name: 'Entrar' })
  expect(screen.getByText('Recuperação de senha em breve')).toBeVisible()
  expect(screen.queryByRole('link', { name: /Esqueci|Recuperação/ })).toBeNull()
  fetchMock.mockImplementation(async url => String(url).endsWith('/auth/login') ? Response.json({ accessToken: 'login-token', tokenType: 'Bearer', expiresAt: new Date(Date.now() + 1800000).toISOString(), user }) : String(url).endsWith('/auth/me') ? Response.json(user) : Response.json([{ id: 1, name: 'Iluminação pública' }]))
  await userEvent.type(screen.getByLabelText('E-mail'), user.email)
  await userEvent.type(screen.getByLabelText('Senha'), 'uma senha longa para testar')
  await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
  expect(await screen.findByRole('heading', { name: 'Relatar problema' })).toBeVisible()
  const nav = within(screen.getByRole('navigation', { name: 'Navegação principal' }))
  expect(nav.getByRole('link', { name: 'Relatar' })).toHaveAttribute('aria-current', 'page')
})
test.each([
  ['/ocorrencias/3e85aa3d-19e3-42a3-8861-c435ff5908af', undefined, 'Mapa'],
  ['/meus-relatos/3e85aa3d-19e3-42a3-8861-c435ff5908af/editar', 'USER', 'Meus relatos'],
  ['/administracao/relatos/3e85aa3d-19e3-42a3-8861-c435ff5908af', 'ADMIN', 'Fila'],
])('detail section remains active at %s', async (path, role, name) => {
  mount(path, role)
  const nav = within(screen.getByRole('navigation', { name: 'Navegação principal' }))
  expect(await nav.findByRole('link', { name })).toHaveAttribute('aria-current', 'page')
})

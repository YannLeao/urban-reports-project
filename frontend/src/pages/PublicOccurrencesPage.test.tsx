import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, expect, test, vi } from 'vitest'
import App from '../App'
import { AuthProvider } from '../features/auth/AuthProvider'

const item = {
  id: '3e85aa3d-19e3-42a3-8861-c435ff5908af', categoryId: 1,
  categoryName: 'Iluminação pública', title: 'Poste apagado na praça',
  description: 'A iluminação está apagada e dificulta a passagem à noite.',
  neighborhood: 'Centro', reference: 'Praça central', status: 'PENDING',
  createdAt: '2026-09-28T12:00:00Z',
}
const pageOf = (items: unknown[], page = 0, totalPages = 1) => ({ items, page, size: 20, totalItems: items.length, totalPages })
const fetchMock = vi.fn<typeof fetch>()
const publicCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).includes('/api/public/'))

beforeEach(() => {
  sessionStorage.clear()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', (url: Parameters<typeof fetch>[0], init?: RequestInit) => String(url).endsWith('/api/public/occurrence-categories') ? Promise.resolve(Response.json([{ id: 1, name: 'Iluminação pública' }, { id: 2, name: 'Buraco ou pavimentação' }])) : fetchMock(url, init))
  vi.stubEnv('VITE_API_URL', 'https://api.example.com')
})
function renderPage(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><AuthProvider><MemoryRouter initialEntries={[path]}><App /></MemoryRouter></AuthProvider></QueryClientProvider>)
}

test('lista pública carrega sem credenciais e liga ao detalhe', async () => {
  fetchMock.mockImplementation(async () => Response.json(pageOf([item])))
  renderPage('/ocorrencias')
  expect(await screen.findByRole('heading', { name: item.title })).toBeVisible()
  expect(screen.getByText('Centro')).toBeVisible()
  expect(screen.getByText('Pendente', { selector: 'span' })).toBeVisible()
  expect(screen.getByRole('link', { name: item.title })).toHaveAttribute('href', `/ocorrencias/${item.id}`)
  const [url, options] = publicCalls()[0]
  expect(String(url)).toBe('https://api.example.com/api/public/occurrences?page=0&size=20')
  expect(options).toMatchObject({ credentials: 'omit' })
  expect(JSON.stringify(options?.headers ?? {})).not.toContain('Authorization')
})

test('lista vazia mostra mensagem amigável', async () => {
  fetchMock.mockImplementation(async () => Response.json(pageOf([])))
  renderPage('/ocorrencias')
  expect(await screen.findByText('Ainda não há relatos públicos')).toBeVisible()
})

test('paginação usa a URL e pede a página seguinte', async () => {
  fetchMock.mockImplementation(async url => Response.json(pageOf([item], String(url).includes('page=1') ? 1 : 0, 2)))
  renderPage('/ocorrencias')
  await userEvent.click(await screen.findByRole('link', { name: 'Próxima página' }))
  expect(await screen.findByText('Página 2 de 2')).toBeVisible()
  const calls = publicCalls()
  expect(String(calls[calls.length - 1][0])).toContain('page=1')
  expect(screen.getByRole('link', { name: 'Página anterior' })).toBeVisible()
})

test('falha mostra mensagem segura e permite tentar de novo', async () => {
  fetchMock.mockImplementationOnce(async () => Response.json({ message: 'detalhe interno' }, { status: 503 }))
  fetchMock.mockImplementation(async () => Response.json(pageOf([])))
  renderPage('/ocorrencias')
  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('Não conseguimos carregar os relatos')
  expect(alert).not.toHaveTextContent('detalhe interno')
  await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
  expect(await screen.findByText('Ainda não há relatos públicos')).toBeVisible()
})

test('detalhe público mostra os dados e a foto pública', async () => {
  fetchMock.mockImplementation(async () => Response.json(item))
  renderPage(`/ocorrencias/${item.id}`)
  expect(await screen.findByRole('heading', { name: item.title })).toBeVisible()
  expect(screen.getByText(item.description)).toBeVisible()
  expect(screen.getByRole('img', { name: `Foto do problema: ${item.title}` }))
    .toHaveAttribute('src', `https://api.example.com/api/public/occurrences/${item.id}/image`)
  expect(JSON.stringify(publicCalls()[0][1]?.headers ?? {})).not.toContain('Authorization')
})

test('detalhe 404 mostra "não encontrada" sem expor detalhes', async () => {
  fetchMock.mockImplementation(async () => Response.json({ message: 'detalhe interno' }, { status: 404 }))
  renderPage(`/ocorrencias/${item.id}`)
  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('Este relato não foi encontrado')
  expect(alert).not.toHaveTextContent('detalhe interno')
})

test('id malformado não faz requisição', async () => {
  renderPage('/ocorrencias/invalid-id')
  expect(await screen.findByRole('alert')).toBeVisible()
  expect(publicCalls()).toHaveLength(0)
})
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, expect, test, vi } from 'vitest'
import App from '../App'
import { AuthProvider } from '../features/auth/AuthProvider'

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  sessionStorage.clear()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', (url: Parameters<typeof fetch>[0], init?: RequestInit) => String(url).endsWith('/api/public/occurrence-categories') ? Promise.resolve(Response.json([{ id: 1, name: 'Iluminação pública' }, { id: 2, name: 'Buraco ou pavimentação' }])) : fetchMock(url, init))
  vi.stubEnv('VITE_API_URL', 'https://api.example.com/base///')
})

function renderPage(path = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } })
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider><MemoryRouter initialEntries={[path]}><App /></MemoryRouter></AuthProvider>
    </QueryClientProvider>,
  )
}

test('home prioritizes product destinations without fetching or exposing technical tools', async () => {
  renderPage()
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Sua rua merece cuidado')
  expect(fetchMock).not.toHaveBeenCalled()
  expect(screen.getByRole('link', { name: 'Ver no mapa' })).toHaveAttribute('href', '/ocorrencias?visao=mapa')
  expect(screen.getByRole('link', { name: 'Relatar problema' })).toHaveAttribute('href', '/registrar-ocorrencia')
  expect(screen.queryByRole('link', { name: /Status|Verificar serviço|Demonstração técnica/ })).toBeNull()
})

test('direct status route shows loading then validates health and preserves the API base path', async () => {
  let resolve!: (response: Response) => void
  fetchMock.mockReturnValue(new Promise<Response>((done) => { resolve = done }))
  renderPage('/status')
  expect(await screen.findByText('Verificando a conexão…')).toBeVisible()
  expect(fetchMock).toHaveBeenCalledWith('https://api.example.com/base/api/health', {
    signal: expect.any(AbortSignal),
  })
  await act(async () => { resolve(Response.json({ status: 'UP' })) })
  expect(await screen.findByText('Conexão confirmada')).toBeVisible()
  expect(screen.queryByText('UP')).not.toBeInTheDocument()
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

test('unknown route offers a return to home', async () => {
  const user = userEvent.setup()
  renderPage('/nao-existe')
  expect(screen.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible()
  await user.click(screen.getByRole('link', { name: 'Voltar ao início' }))
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Sua rua merece cuidado')
  expect(fetchMock).not.toHaveBeenCalled()
})

test.each(['http', 'network'])('%s failure is visible and manual retry recovers', async (failure) => {
  if (failure === 'http') fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }))
  else fetchMock.mockImplementationOnce(() => Promise.reject(new TypeError('internal network details')))
  fetchMock.mockResolvedValueOnce(Response.json({ status: 'UP' }))
  const user = userEvent.setup()
  renderPage('/status')
  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent(failure === 'http' ? 'O serviço não concluiu a verificação' : 'Não conseguimos conectar ao serviço')
  expect(alert).not.toHaveTextContent('internal network details')
  expect(fetchMock).toHaveBeenCalledTimes(1)
  await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))
  expect(await screen.findByText('Conexão confirmada')).toBeVisible()
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

test.each([{ status: 123 }, {}, { status: 'DOWN' }, null])('rejects incompatible successful payload %j', async (payload) => {
  fetchMock.mockResolvedValue(Response.json(payload))
  renderPage('/status')
  expect(await screen.findByRole('alert')).toHaveTextContent('O serviço enviou uma resposta que não conseguimos reconhecer.')
  expect(screen.queryByText('Conexão confirmada')).not.toBeInTheDocument()
})

test('invalid JSON is a comprehensible error', async () => {
  fetchMock.mockResolvedValue(new Response('<html>proxy error</html>'))
  renderPage('/status')
  expect(await screen.findByRole('alert')).toHaveTextContent('O serviço enviou uma resposta que não conseguimos reconhecer.')
})

test.each([
  [undefined, 'não foi configurada'],
  ['', 'não foi configurada'],
  ['not-a-url', 'configuração de conexão do site precisa ser corrigida'],
  ['ftp://api.example.com', 'configuração de conexão do site precisa ser corrigida'],
  ['https://user:secret@api.example.com', 'configuração de conexão do site precisa ser corrigida'],
  ['https://api.example.com?token=secret', 'configuração de conexão do site precisa ser corrigida'],
  ['https://api.example.com#fragment', 'configuração de conexão do site precisa ser corrigida'],
  ['http://api.example.com', 'configuração de conexão do site precisa ser corrigida'],
])('invalid configuration %s fails only on status, without a request', async (url, message) => {
  vi.stubEnv('VITE_API_URL', url)
  renderPage('/status')
  expect(await screen.findByRole('alert')).toHaveTextContent(message)
  expect(fetchMock).not.toHaveBeenCalled()
})

test('leaving status cancels the request through the query signal', async () => {
  fetchMock.mockReturnValue(new Promise(() => {}))
  const user = userEvent.setup()
  renderPage('/status')
  await screen.findByText('Verificando a conexão…')
  const signal = fetchMock.mock.calls[0][1]?.signal
  expect(signal?.aborted).toBe(false)
  await user.click(screen.getByRole('link', { name: 'Alô Cidade, início' }))
  await waitFor(() => expect(signal?.aborted).toBe(true))
})

test('image proof is public, independent of API configuration, and loses selection on navigation', async () => {
  vi.stubEnv('VITE_API_URL', undefined)
  vi.stubGlobal('URL', Object.assign(class extends URL {}, {
    createObjectURL: vi.fn(() => 'blob:proof'), revokeObjectURL: vi.fn(),
  }))
  const images: { onload: (() => void) | null }[] = []
  vi.stubGlobal('Image', class {
    onload: (() => void) | null = null
    onerror = null
    naturalWidth = 10
    naturalHeight = 10
    src = ''
    constructor() { images.push(this) }
  })
  const user = userEvent.setup()
  renderPage('/prova-imagem')
  expect(await screen.findByRole('heading', { name: 'Teste de fotografia' })).toBeVisible()
  expect(screen.getByText('A imagem fica apenas nesta página e não é enviada.')).toBeVisible()
  await user.upload(screen.getByLabelText('Arquivo de imagem'), new File(['fixture'], 'photo.png', { type: 'image/png' }))
  await act(async () => images[0]?.onload?.())
  expect(screen.getByRole('img', { name: 'Prévia da imagem selecionada' })).toBeVisible()
  await user.click(screen.getByRole('link', { name: 'Alô Cidade, início' }))
  expect(screen.queryByRole('link', { name: /Demonstração técnica/ })).toBeNull()
  expect(screen.queryByRole('img', { name: 'Prévia da imagem selecionada' })).not.toBeInTheDocument()
  expect(fetchMock).not.toHaveBeenCalled()
})

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, expect, test, vi } from 'vitest'
import App from '../App'

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('VITE_API_URL', 'https://api.example.com/base///')
})

function renderPage(path = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}><App /></MemoryRouter>
    </QueryClientProvider>,
  )
}

test('navigates from home to status and back without fetching on home', async () => {
  fetchMock.mockResolvedValue(Response.json({ status: 'UP' }))
  const user = userEvent.setup()
  renderPage()
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Tudo começa')
  expect(fetchMock).not.toHaveBeenCalled()
  await user.click(screen.getByRole('link', { name: 'Verificar serviço' }))
  expect(await screen.findByText('Conexão confirmada')).toBeVisible()
  await user.click(screen.getByRole('link', { name: 'Início' }))
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Tudo começa')
})

test('direct status route shows loading then validates health and preserves the API base path', async () => {
  let resolve!: (response: Response) => void
  fetchMock.mockReturnValue(new Promise<Response>((done) => { resolve = done }))
  renderPage('/status')
  expect(screen.getByText('Verificando a conexão…')).toBeVisible()
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
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Tudo começa')
  expect(fetchMock).not.toHaveBeenCalled()
})

test.each(['http', 'network'])('%s failure is visible and manual retry recovers', async (failure) => {
  if (failure === 'http') fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }))
  else fetchMock.mockRejectedValueOnce(new TypeError('internal network details'))
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
  const user = userEvent.setup()
  renderPage()
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Tudo começa')
  await user.click(screen.getByRole('link', { name: 'Verificar serviço' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(message)
  expect(fetchMock).not.toHaveBeenCalled()
})

test('leaving status cancels the request through the query signal', async () => {
  fetchMock.mockReturnValue(new Promise(() => {}))
  const user = userEvent.setup()
  renderPage('/status')
  const signal = fetchMock.mock.calls[0][1]?.signal
  expect(signal?.aborted).toBe(false)
  await user.click(screen.getByRole('link', { name: 'Início' }))
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
  expect(screen.getByRole('heading', { name: 'Teste de fotografia' })).toBeVisible()
  expect(screen.getByText('A imagem fica apenas nesta página e não é enviada.')).toBeVisible()
  await user.upload(screen.getByLabelText('Arquivo de imagem'), new File(['fixture'], 'photo.png', { type: 'image/png' }))
  await act(async () => images[0]?.onload?.())
  expect(screen.getByRole('img', { name: 'Prévia da imagem selecionada' })).toBeVisible()
  await user.click(screen.getByRole('link', { name: 'Início' }))
  await user.click(screen.getByRole('link', { name: 'Demonstração técnica: teste de fotografia' }))
  expect(screen.queryByRole('img', { name: 'Prévia da imagem selecionada' })).not.toBeInTheDocument()
  expect(fetchMock).not.toHaveBeenCalled()
})

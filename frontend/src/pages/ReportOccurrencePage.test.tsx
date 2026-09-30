import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, expect, test, vi } from 'vitest'
import App from '../App'
import { AuthProvider } from '../features/auth/AuthProvider'
import { STORAGE_KEY } from '../features/auth/auth'

const fetchMock = vi.fn<typeof fetch>()
let images: FakeImage[]
class FakeImage {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  naturalWidth = 20
  naturalHeight = 10
  src = ''
  constructor() { images.push(this) }
}
const person = { id: 'a50062d3-9ac2-4e70-86fa-eac5249f4d0c', name: 'Ana', email: 'ana@example.com', role: 'USER' }
const result = { id: 'b50062d3-9ac2-4e70-86fa-eac5249f4d0c', status: 'PENDING' }
beforeEach(() => {
  images = []
  sessionStorage.clear()
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ accessToken: 'synthetic-token', expiresAt: new Date(Date.now() + 1800000).toISOString() }))
  fetchMock.mockReset().mockResolvedValueOnce(Response.json(person)).mockResolvedValueOnce(Response.json([{ id: 1, name: 'Iluminação pública' }]))
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('Image', FakeImage)
  vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: vi.fn(() => 'blob:photo'), revokeObjectURL: vi.fn() }))
  vi.stubEnv('VITE_API_URL', 'https://api.example.com')
})
function renderPage() {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AuthProvider><MemoryRouter initialEntries={['/registrar-ocorrencia']}><App /></MemoryRouter></AuthProvider></QueryClientProvider>)
}
function choose(name = 'photo.png', camera = false, type = 'image/png') {
  const file = new File(['synthetic image'], name, { type })
  fireEvent.change(screen.getByLabelText(camera ? 'Fotografia pela câmera' : 'Arquivo de imagem'), { target: { files: [file] } })
  return file
}
async function finish(fail = false) {
  await act(async () => { if (fail) images.at(-1)?.onerror?.(); else images.at(-1)?.onload?.() })
}
async function fill() {
  renderPage()
  await screen.findByRole('option', { name: 'Iluminação pública' })
  fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: '1' } })
  for (const [label, value] of [['Título', '  Poste apagado 💡  '], ['Detalhes (opcional)', 'A iluminação desta rua está apagada.'], ['Bairro', 'Centro'], ['Ponto de referência', 'Ao lado da escola']]) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } })
  }
  choose(); await finish()
}
function submit() { fireEvent.submit(screen.getByRole('button', { name: 'Enviar ocorrência' }).closest('form')!) }

test('validates fields locally without upload and focuses the first error', async () => {
  renderPage(); await screen.findByRole('option', { name: 'Iluminação pública' }); submit()
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(screen.getByLabelText('Categoria')).toHaveFocus()
  expect(screen.getByText('Escolha exatamente uma imagem.')).toBeVisible()
})

test('sends one authenticated multipart snapshot, blocks all edits and resets only after 201', async () => {
  await fill()
  let resolve!: (response: Response) => void
  fetchMock.mockImplementationOnce(() => new Promise<Response>(done => { resolve = done }))
  act(() => { submit(); submit() })
  expect(fetchMock).toHaveBeenCalledTimes(3)
  const options = fetchMock.mock.calls[2][1]!
  expect(options.headers).toEqual({ Authorization: 'Bearer synthetic-token' })
  expect(options.credentials).toBe('omit')
  const body = options.body as FormData
  expect([...body.keys()]).toEqual(['categoryId', 'title', 'description', 'neighborhood', 'reference', 'image'])
  expect(body.get('title')).toBe('Poste apagado 💡')
  expect((body.get('image') as File).name).toBe('photo.png')
  for (const label of ['Categoria', 'Título', 'Detalhes (opcional)', 'Bairro', 'Ponto de referência', 'Arquivo de imagem', 'Fotografia pela câmera']) expect(screen.getByLabelText(label)).toBeDisabled()
  for (const name of ['Trocar imagem', 'Tirar outra foto', 'Remover imagem']) expect(screen.getByRole('button', { name })).toBeDisabled()
  await act(async () => { resolve(Response.json(result, { status: 201 })) })
  expect(await screen.findByText('Relato registrado')).toHaveFocus()
  expect(screen.queryByText(result.id)).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Ver relato' })).toHaveAttribute('href', `/meus-relatos/${result.id}`)
  await userEvent.click(screen.getByRole('button', { name: 'Registrar outro problema' }))
  expect(screen.getByLabelText('Título')).toHaveValue('')
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
})

test('blocks submit during replacement validation and sends only the latest accepted photo', async () => {
  await fill(); fetchMock.mockResolvedValueOnce(Response.json(result, { status: 201 }))
  choose('second.png', true)
  expect(screen.getByRole('button', { name: 'Enviar ocorrência' })).toBeDisabled()
  submit(); expect(fetchMock).toHaveBeenCalledTimes(2)
  await finish(); submit()
  await screen.findByText('Relato registrado')
  expect(((fetchMock.mock.calls[2][1]?.body as FormData).get('image') as File).name).toBe('second.png')
})

test('camera cancellation, invalid selection and failed decoding preserve fields and previous photo', async () => {
  await fill()
  await userEvent.click(screen.getByRole('button', { name: 'Tirar outra foto' }))
  fireEvent.change(screen.getByLabelText('Fotografia pela câmera'), { target: { files: [] } })
  expect(fetchMock).toHaveBeenCalledTimes(2)
  choose('bad.gif', true, 'image/gif')
  expect(screen.getByRole('alert')).toHaveTextContent('anterior foi mantida')
  choose('broken.png', true); await finish(true)
  expect(screen.getByRole('alert')).toHaveTextContent('anterior foi mantida')
  expect(screen.getByLabelText('Título')).toHaveValue('  Poste apagado 💡  ')
  expect(screen.getByText(/photo.png/)).toBeVisible()
  expect(screen.getByRole('button', { name: 'Enviar ocorrência' })).toBeEnabled()
})

test.each([
  [400, { code: 'VALIDATION_ERROR', fieldErrors: { request: ['Internal request detail'], unknown: ['English secret'] } }, 'Confira os campos'],
  [400, { code: 'VALIDATION_ERROR', fieldErrors: { title: ['English secret'] } }, 'Confira os campos'],
  [413, { code: 'IMAGE_TOO_LARGE' }, '5 MiB'],
  [502, { code: 'IMAGE_STORAGE_UNAVAILABLE' }, 'serviço de fotos'],
  [500, { code: 'INTERNAL_ERROR' }, 'não confirmou'],
  [403, {}, 'não confirmou'],
])('HTTP %s errors are visible in Portuguese and preserve data without retries', async (status, payload, message) => {
  await fill(); fetchMock.mockResolvedValueOnce(Response.json(payload, { status }))
  submit()
  expect(await screen.findByRole('alert')).toHaveTextContent(message)
  await waitFor(() => expect(screen.getByRole('alert')).toHaveFocus())
  expect(screen.queryByText(/English secret|Internal request detail/)).not.toBeInTheDocument()
  expect(screen.getByLabelText('Título')).toHaveValue('  Poste apagado 💡  ')
  expect(screen.getByText(/photo.png/)).toBeVisible()
  expect(fetchMock).toHaveBeenCalledTimes(3)
  expect(sessionStorage.getItem(STORAGE_KEY)).not.toBeNull()
})

test.each(['network', 'malformed', 'wrong-status'])('%s expresses uncertain outcome and releases guard for manual retry', async failure => {
  await fill()
  if (failure === 'network') fetchMock.mockRejectedValueOnce(new TypeError('secret network detail'))
  else if (failure === 'malformed') fetchMock.mockResolvedValueOnce(new Response('invalid json', { status: 201 }))
  else fetchMock.mockResolvedValueOnce(Response.json(result, { status: 200 }))
  submit()
  expect(await screen.findByRole('alert')).toHaveTextContent('reenviar pode criar uma ocorrência duplicada')
  expect(screen.getByText(/photo.png/)).toBeVisible()
  fetchMock.mockResolvedValueOnce(Response.json(result, { status: 201 }))
  submit(); await screen.findByText('Relato registrado')
  expect(fetchMock).toHaveBeenCalledTimes(4)
})

test('401 ends the session through AuthProvider without persisting form data', async () => {
  await fill(); fetchMock.mockResolvedValueOnce(Response.json({ code: 'UNAUTHORIZED' }, { status: 401 }))
  submit()
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Entrar' })).toBeVisible())
  expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()
  expect(sessionStorage.length).toBe(0)
  expect(fetchMock).toHaveBeenCalledTimes(3)
})


test.each(['', '  ', 'Muito lixo.', '😀'.repeat(1000)])('accepts optional description or short Unicode content', async description => {
  await fill()
  fireEvent.change(screen.getByLabelText('Detalhes (opcional)'), { target: { value: description } })
  fetchMock.mockResolvedValueOnce(Response.json(result, { status: 201 }))
  submit()
  expect(await screen.findByRole('heading', { name: 'Relato registrado' })).toBeVisible()
  expect((fetchMock.mock.calls[2][1]?.body as FormData).get('description')).toBe(description.trim())
})
test('rejects 1001 Unicode points before sending multipart', async () => {
  await fill()
  fireEvent.change(screen.getByLabelText('Detalhes (opcional)'), { target: { value: '😀'.repeat(1001) } })
  submit()
  expect(screen.getByLabelText('Detalhes (opcional)')).toHaveFocus()
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

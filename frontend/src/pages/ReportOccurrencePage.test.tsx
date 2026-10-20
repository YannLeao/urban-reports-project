import { withEmptyNotifications } from '../test/notification-fixture'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, expect, test, vi } from 'vitest'
import App from '../App'
import { AuthProvider } from '../features/auth/AuthProvider'
import { STORAGE_KEY } from '../features/auth/auth'

vi.mock('../features/location/LocationMap', () => ({ LocationMap: () => null }))

const fetchMock = vi.fn<typeof fetch>()
const similarFetch = vi.fn<typeof fetch>()
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
  similarFetch.mockReset().mockImplementation(() => Promise.resolve(Response.json({ radiusMeters: 100, limit: 5, items: [] })))
  fetchMock.mockReset().mockResolvedValueOnce(Response.json(person)).mockResolvedValueOnce(Response.json([{ id: 1, name: 'Iluminação pública' }]))
  vi.stubGlobal('fetch', withEmptyNotifications((url, options) => String(url).endsWith('/occurrences/similar')
    ? similarFetch(url, options) : fetchMock(url, options)))
  vi.stubGlobal('Image', FakeImage)
  vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: vi.fn(() => 'blob:photo'), revokeObjectURL: vi.fn() }))
  vi.stubEnv('VITE_API_URL', 'https://api.example.com')
})
function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(<QueryClientProvider client={client}><AuthProvider><MemoryRouter initialEntries={['/registrar-ocorrencia']}><App /></MemoryRouter></AuthProvider></QueryClientProvider>)
  return { client, ...view }
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
  const view = renderPage()
  await screen.findByRole('option', { name: 'Iluminação pública' })
  fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: '1' } })
  for (const [label, value] of [['Título', '  Poste apagado 💡  '], ['Detalhes (opcional)', 'A iluminação desta rua está apagada.'], ['Bairro', 'Centro'], ['Ponto de referência', 'Ao lado da escola']]) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } })
  }
  fireEvent.click(screen.getByText('Informar coordenadas'))
  fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '-23.55052' } })
  fireEvent.change(screen.getByLabelText('Longitude'), { target: { value: '-46.633308' } })
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar coordenadas' }))
  choose(); await finish()
  return view
}
async function submit() {
  fireEvent.submit(screen.getByRole('button', { name: 'Enviar relato' }).closest('form')!)
  if (!screen.queryByRole('heading', { name: 'Antes de confirmar' })) return
  const confirm = await screen.findByRole('button', { name: 'Confirmar envio' })
  await waitFor(() => expect(confirm).toBeEnabled())
  fireEvent.click(confirm)
}

test('validates fields locally without upload and focuses the first error', async () => {
  renderPage(); await screen.findByRole('option', { name: 'Iluminação pública' }); await submit()
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(screen.getByRole('button', { name: 'Tirar foto' })).toHaveFocus()
  expect(screen.getByRole('button', { name: 'Tirar foto' })).toHaveAccessibleDescription(/Escolha de 1 a 5 fotos/)
  expect(screen.getByText('Escolha de 1 a 5 fotos.')).toBeVisible()
})

test('sends one authenticated multipart snapshot, blocks all edits and resets only after 201', async () => {
  await fill()
  let resolve!: (response: Response) => void
  fetchMock.mockImplementationOnce(() => new Promise<Response>(done => { resolve = done }))
  await submit()
  fireEvent.submit(screen.getByRole('button', { name: 'Enviando…' }).closest('form')!)
  expect(fetchMock).toHaveBeenCalledTimes(3)
  const options = fetchMock.mock.calls[2][1]!
  expect(options.headers).toEqual({ Authorization: 'Bearer synthetic-token' })
  expect(options.credentials).toBe('omit')
  const body = options.body as FormData
  expect([...body.keys()]).toEqual(['categoryId', 'title', 'description', 'neighborhood', 'reference', 'latitude', 'longitude', 'images'])
  expect(body.get('latitude')).toBe('-23.55052')
  expect(body.get('longitude')).toBe('-46.633308')
  expect(body.get('title')).toBe('Poste apagado 💡')
  expect((body.get('images') as File).name).toBe('photo.png')
  for (const label of ['Categoria', 'Título', 'Detalhes (opcional)', 'Bairro', 'Ponto de referência', 'Arquivo de imagem', 'Fotografia pela câmera']) expect(screen.getByLabelText(label)).toBeDisabled()
  for (const name of ['Escolher da galeria', 'Tirar foto', 'Remover foto 1']) expect(screen.getByRole('button', { name })).toBeDisabled()
  await act(async () => { resolve(Response.json(result, { status: 201 })) })
  expect(await screen.findByText('Relato registrado')).toHaveFocus()
  expect(screen.queryByText(result.id)).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Ver relato' })).toHaveAttribute('href', `/meus-relatos/${result.id}`)
  await userEvent.click(screen.getByRole('button', { name: 'Relatar outro problema' }))
  expect(screen.getByLabelText('Título')).toHaveValue('')
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
})

test('blocks submit during incremental capture validation and sends both accepted photos', async () => {
  await fill(); fetchMock.mockResolvedValueOnce(Response.json(result, { status: 201 }))
  choose('second.png', true)
  expect(screen.getByRole('button', { name: 'Enviar relato' })).toBeDisabled()
  await submit(); expect(fetchMock).toHaveBeenCalledTimes(2)
  await finish(); await submit()
  await screen.findByText('Relato registrado')
  expect((fetchMock.mock.calls[2][1]?.body as FormData).getAll('images').map(file => (file as File).name)).toEqual(['photo.png', 'second.png'])
})

test('camera cancellation, invalid selection and failed decoding preserve fields and previous photo', async () => {
  await fill()
  await userEvent.click(screen.getByRole('button', { name: 'Tirar foto' }))
  fireEvent.change(screen.getByLabelText('Fotografia pela câmera'), { target: { files: [] } })
  expect(fetchMock).toHaveBeenCalledTimes(2)
  choose('bad.gif', true, 'image/gif')
  expect(screen.getByRole('alert')).toHaveTextContent('anteriores foram mantidas')
  choose('broken.png', true); await finish(true)
  expect(screen.getByRole('alert')).toHaveTextContent('anteriores foram mantidas')
  expect(screen.getByLabelText('Título')).toHaveValue('  Poste apagado 💡  ')
  expect(screen.getByRole('img', { name: 'Prévia da foto 1' })).toBeVisible()
  expect(screen.getByRole('button', { name: 'Enviar relato' })).toBeEnabled()
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
  await submit()
  expect(await screen.findByRole('alert')).toHaveTextContent(message)
  await waitFor(() => expect(screen.getByRole('alert')).toHaveFocus())
  expect(screen.queryByText(/English secret|Internal request detail/)).not.toBeInTheDocument()
  expect(screen.getByLabelText('Título')).toHaveValue('  Poste apagado 💡  ')
  expect(screen.getByRole('img', { name: 'Prévia da foto 1' })).toBeVisible()
  expect(screen.getByText(/Local confirmado: latitude -23.550520, longitude -46.633308/)).toBeVisible()
  expect(fetchMock).toHaveBeenCalledTimes(3)
  expect(sessionStorage.getItem(STORAGE_KEY)).not.toBeNull()
})

test.each(['network', 'malformed', 'wrong-status'])('%s expresses uncertain outcome and releases guard for manual retry', async failure => {
  await fill()
  if (failure === 'network') fetchMock.mockRejectedValueOnce(new TypeError('secret network detail'))
  else if (failure === 'malformed') fetchMock.mockResolvedValueOnce(new Response('invalid json', { status: 201 }))
  else fetchMock.mockResolvedValueOnce(Response.json(result, { status: 200 }))
  await submit()
  expect(await screen.findByRole('alert')).toHaveTextContent('reenviar pode criar um relato duplicado')
  expect(screen.getByRole('img', { name: 'Prévia da foto 1' })).toBeVisible()
  fetchMock.mockResolvedValueOnce(Response.json(result, { status: 201 }))
  await submit(); await screen.findByText('Relato registrado')
  expect(fetchMock).toHaveBeenCalledTimes(4)
})

test('401 ends the session through AuthProvider without persisting form data', async () => {
  await fill(); fetchMock.mockResolvedValueOnce(Response.json({ code: 'UNAUTHORIZED' }, { status: 401 }))
  await submit()
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Entrar' })).toBeVisible())
  expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()
  expect(sessionStorage.length).toBe(0)
  expect(fetchMock).toHaveBeenCalledTimes(3)
})


test.each(['', '  ', 'Muito lixo.', '😀'.repeat(1000)])('accepts optional description or short Unicode content', async description => {
  await fill()
  fireEvent.change(screen.getByLabelText('Detalhes (opcional)'), { target: { value: description } })
  fetchMock.mockResolvedValueOnce(Response.json(result, { status: 201 }))
  await submit()
  expect(await screen.findByRole('heading', { name: 'Relato registrado' })).toBeVisible()
  expect((fetchMock.mock.calls[2][1]?.body as FormData).get('description')).toBe(description.trim())
})
test('rejects 1001 Unicode points before sending multipart', async () => {
  await fill()
  fireEvent.change(screen.getByLabelText('Detalhes (opcional)'), { target: { value: '😀'.repeat(1001) } })
  await submit()
  expect(screen.getByLabelText('Detalhes (opcional)')).toHaveFocus()
  expect(fetchMock).toHaveBeenCalledTimes(2)
})


test('coordinates typed without confirmation do not authorize a new registration', async () => {
  renderPage()
  await screen.findByRole('option', { name: 'Iluminação pública' })
  for (const [label, value] of [['Categoria', '1'], ['Título', 'Poste apagado'], ['Bairro', 'Centro'], ['Ponto de referência', 'Perto da praça'], ['Latitude', '0'], ['Longitude', '0']])
    fireEvent.change(screen.getByLabelText(label), { target: { value } })
  choose(); await finish(); await submit()
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(screen.getByLabelText('Latitude')).toHaveFocus()
  expect(screen.getByText('Confirme o local real do problema.')).toBeVisible()
  expect(screen.getByRole('img', { name: 'Prévia da foto 1' })).toBeVisible()
})

test('video mode submits one authenticated video and preserves draft on capacity failure', async () => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
  await fill()
  fireEvent.click(screen.getByRole('button', { name: 'Vídeo' }))
  fireEvent.click(screen.getByRole('button', { name: 'Trocar mídia' }))
  const file = new File(['synthetic video'], 'local-only.mp4', { type: 'video/mp4' })
  fireEvent.change(screen.getByLabelText('Escolher vídeo'), { target: { files: [file] } })
  fetchMock.mockResolvedValueOnce(Response.json({ code: 'VIDEO_VALIDATION_BUSY' }, { status: 503 }))
  await submit()
  await screen.findByText(/O serviço de mídia está indisponível ou ocupado/)
  const options = fetchMock.mock.calls[2][1]!
  expect(options.headers).toEqual({ Authorization: 'Bearer synthetic-token' })
  const body = options.body as FormData
  expect(body.getAll('video')).toHaveLength(1); expect(body.getAll('images')).toHaveLength(0)
  expect(body.get('video')).toMatchObject({ name: 'upload.mp4', type: 'video/mp4', size: file.size })
  expect(body.has('media')).toBe(false)
  expect(screen.getByLabelText('Título')).toHaveValue('  Poste apagado 💡  ')
  expect(screen.getByText(/local-only.mp4/)).toBeVisible()
  expect(screen.getByRole('button', { name: 'Vídeo' })).toHaveAttribute('aria-pressed', 'true')
  fetchMock.mockResolvedValueOnce(Response.json(result, { status: 201 }))
  await submit(); await screen.findByText('Relato registrado')
  expect(fetchMock).toHaveBeenCalledTimes(4)
})

const candidate = { id: 'c50062d3-9ac2-4e70-86fa-eac5249f4d0c', categoryId: 1, categoryName: 'Iluminação pública',
  title: 'Outro poste apagado', neighborhood: 'Centro', reference: 'Próximo à escola', status: 'PENDING',
  createdAt: '2026-10-19T12:00:00Z', distanceMeters: 32.4 }
const reviewForm = () => fireEvent.submit(screen.getByRole('button', { name: 'Enviar relato' }).closest('form')!)

test('review is read-only, preserves files and opens public candidates separately; revisiting reuses this review', async () => {
  await fill()
  similarFetch.mockResolvedValueOnce(Response.json({ radiusMeters: 100, limit: 5, items: [candidate] }))
  reviewForm()
  expect(await screen.findByText(candidate.title)).toBeVisible()
  expect(screen.getByRole('heading', { name: 'Antes de confirmar' }).parentElement).toHaveFocus()
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(similarFetch).toHaveBeenCalledTimes(1)
  const options = similarFetch.mock.calls[0][1]!
  expect(options.method).toBe('POST')
  expect(options.headers).toEqual({ Authorization: 'Bearer synthetic-token', 'Content-Type': 'application/json' })
  expect(JSON.parse(options.body as string)).toEqual({ categoryId: 1, latitude: -23.55052, longitude: -46.633308 })
  const link = screen.getByRole('link', { name: 'Consultar relato (abre em nova aba)' })
  expect(link).toHaveAttribute('href', `/ocorrencias/${candidate.id}`)
  expect(link).toHaveAttribute('target', '_blank')
  expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  fireEvent.click(screen.getByRole('button', { name: 'Revisar meu relato' }))
  fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Título atualizado durante revisão' } })
  reviewForm()
  expect(await screen.findByText(candidate.title)).toBeVisible()
  expect(similarFetch).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('img', { name: 'Prévia da foto 1' })).toBeVisible()
  fetchMock.mockResolvedValueOnce(Response.json(result, { status: 201 }))
  const confirm = screen.getByRole('button', { name: 'É outro relato, continuar' })
  fireEvent.click(confirm); fireEvent.click(confirm)
  await screen.findByText('Relato registrado')
  expect(fetchMock).toHaveBeenCalledTimes(3)
  expect((fetchMock.mock.calls[2][1]?.body as FormData).get('title')).toBe('Título atualizado durante revisão')
})

test('changing confirmed point cancels A and prevents its late result or confirmation from affecting B', async () => {
  await fill()
  let resolve!: (response: Response) => void
  similarFetch.mockImplementationOnce(() => new Promise<Response>(done => { resolve = done }))
  reviewForm()
  await screen.findByText('Consultando relatos próximos…')
  expect(screen.getByRole('button', { name: 'Confirmar envio' })).toBeDisabled()
  reviewForm() // Enter cannot write, even during search.
  expect(fetchMock).toHaveBeenCalledTimes(2)
  const signal = similarFetch.mock.calls[0][1]?.signal
  fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '0' } })
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar coordenadas' }))
  expect(signal?.aborted).toBe(true)
  expect(screen.queryByRole('heading', { name: 'Antes de confirmar' })).not.toBeInTheDocument()
  reviewForm()
  await screen.findByText('Não encontramos relatos semelhantes nesta consulta')
  await act(async () => { resolve(Response.json({ radiusMeters: 100, limit: 5, items: [candidate] })) })
  expect(screen.queryByText(candidate.title)).not.toBeInTheDocument()
  expect(similarFetch).toHaveBeenCalledTimes(2)
  expect(JSON.parse(similarFetch.mock.calls[1][1]?.body as string).latitude).toBe(0)
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

test.each(['network', '503', 'schema'])('auxiliary %s failure offers explicit bypass and manual retry without upload', async failure => {
  await fill()
  if (failure === 'network') similarFetch.mockRejectedValueOnce(new TypeError('private detail'))
  else if (failure === '503') similarFetch.mockResolvedValueOnce(Response.json({ code: 'SIMILAR_OCCURRENCES_UNAVAILABLE' }, { status: 503 }))
  else similarFetch.mockResolvedValueOnce(Response.json({ radiusMeters: 101, limit: 5, items: [] }))
  reviewForm()
  await screen.findByText('Não foi possível consultar relatos semelhantes')
  expect(screen.getByRole('button', { name: 'Enviar mesmo assim' })).toBeEnabled()
  expect(screen.queryByText('Não encontramos relatos semelhantes nesta consulta')).not.toBeInTheDocument()
  expect(fetchMock).toHaveBeenCalledTimes(2)
  fireEvent.click(screen.getByRole('button', { name: 'Consultar novamente' }))
  await screen.findByText('Não encontramos relatos semelhantes nesta consulta')
  expect(similarFetch).toHaveBeenCalledTimes(2)
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

test('an unavailable lookup allows one explicitly confirmed normal multipart write', async () => {
  await fill()
  similarFetch.mockRejectedValueOnce(new TypeError('unavailable'))
  reviewForm()
  const bypass = await screen.findByRole('button', { name: 'Enviar mesmo assim' })
  fetchMock.mockResolvedValueOnce(Response.json(result, { status: 201 }))
  fireEvent.click(bypass); fireEvent.click(bypass)
  await screen.findByText('Relato registrado')
  expect(fetchMock).toHaveBeenCalledTimes(3)
  expect((fetchMock.mock.calls[2][1]?.body as FormData).get('images')).toBeInstanceOf(File)
})

test('403 is access denial, preserves session and cannot bypass authorization failure', async () => {
  await fill()
  similarFetch.mockResolvedValueOnce(Response.json({}, { status: 403 }))
  reviewForm()
  await screen.findByText('Sua conta não tem acesso à consulta de relatos semelhantes.')
  expect(screen.queryByRole('button', { name: 'Enviar mesmo assim' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Confirmar envio' })).not.toBeInTheDocument()
  expect(sessionStorage.getItem(STORAGE_KEY)).not.toBeNull()
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

test('401 in auxiliary lookup ends session and removes private review cache', async () => {
  await fill()
  similarFetch.mockResolvedValueOnce(Response.json({}, { status: 401 }))
  reviewForm()
  await screen.findByRole('heading', { name: 'Entrar' })
  expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

test('leaving review aborts its private lookup and removes the user cache', async () => {
  const view = await fill()
  similarFetch.mockImplementationOnce(() => new Promise<Response>(() => {}))
  reviewForm()
  await screen.findByText('Consultando relatos próximos…')
  const signal = similarFetch.mock.calls[0][1]?.signal
  view.unmount()
  expect(signal?.aborted).toBe(true)
  expect(view.client.getQueryCache().findAll({ queryKey: ['private'] })).toHaveLength(0)
})

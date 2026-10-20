import { withEmptyNotifications } from '../test/notification-fixture'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, expect, test, vi } from 'vitest'
import App from '../App'
import { AuthProvider } from '../features/auth/AuthProvider'
import type { Occurrence } from '../features/occurrence/occurrence'
import { STORAGE_KEY } from '../features/auth/auth'

vi.mock('../features/location/LocationMap', () => ({ LocationMap: ({onSelect}: {onSelect: (p: {latitude:number;longitude:number}) => void}) => <button type="button" onClick={() => onSelect({latitude:-12.34,longitude:45.67})}>Escolher no mapa</button> }))

const person = { id: 'a50062d3-9ac2-4e70-86fa-eac5249f4d0c', name: 'Ana Silva', email: 'ana@example.com', role: 'USER' }
const report = {
  media: [{ id: 'b50062d3-9ac2-4e70-86fa-eac5249f4d0c', type: 'IMAGE' as const, mime: 'image/png' as const, sizeBytes: null, position: 0, endpoint: '/api/occurrences/example/media/example' }],
  id: '3e85aa3d-19e3-42a3-8861-c435ff5908af', categoryId: 1 as const,
  categoryName: 'Iluminação pública', title: 'Poste apagado na praça',
  description: 'A iluminação está apagada e dificulta a passagem à noite.',
  neighborhood: 'Centro', reference: 'Praça central', status: 'PENDING',
  latitude: null, longitude: null, version: 0, createdAt: '2026-09-28T12:00:00Z',
}
const fetchMock = vi.fn<typeof fetch>()
const similarFetch = vi.fn<typeof fetch>()
beforeEach(() => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  sessionStorage.clear()
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ accessToken: 'synthetic-token', expiresAt: new Date(Date.now() + 1800000).toISOString() }))
  similarFetch.mockReset().mockImplementation(() => Promise.resolve(Response.json({ radiusMeters: 100, limit: 5, items: [] })))
  fetchMock.mockReset().mockResolvedValueOnce(Response.json(person))
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} })
  vi.stubGlobal('fetch', withEmptyNotifications((url, options) => String(url).endsWith('/occurrences/similar')
    ? similarFetch(url, options) : fetchMock(url, options)))
  vi.stubEnv('VITE_API_URL', 'https://api.example.com')
})
function renderPage(path = '/meus-relatos') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(<QueryClientProvider client={client}><AuthProvider><MemoryRouter initialEntries={[path]}><App /></MemoryRouter></AuthProvider></QueryClientProvider>)
  return { client, ...view }
}

test('loading is visible and leaving cancels the private request', async () => {
  let resolve!: (response: Response) => void
  fetchMock.mockReturnValueOnce(new Promise<Response>(done => { resolve = done }))
  const view = renderPage()
  expect(await screen.findByText('Carregando seus relatos…')).toBeVisible()
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  const signal = fetchMock.mock.calls[1][1]?.signal
  view.unmount()
  expect(signal?.aborted).toBe(true)
  await act(async () => resolve(Response.json([report])))
  expect(view.client.getQueryCache().findAll({ queryKey: ['private'] })).toHaveLength(0)
})

test('empty state links to registration', async () => {
  fetchMock.mockResolvedValueOnce(Response.json([]))
  renderPage()
  expect(await screen.findByText('Você ainda não registrou relatos')).toBeVisible()
  expect(screen.getByRole('link', { name: 'Registrar problema' })).toHaveAttribute('href', '/registrar-ocorrencia')
})

test('list and detail use authenticated requests and user-scoped cache', async () => {
  fetchMock.mockResolvedValueOnce(Response.json([report])).mockResolvedValueOnce(Response.json(report))
  const { client } = renderPage()
  expect(await screen.findByRole('heading', { name: report.title })).toBeVisible()
  expect(screen.getByText('Pendente', { selector: 'span' })).toBeVisible()
  expect(screen.getByText('Centro')).toBeVisible()
  expect(client.getQueryData(['private', person.id, 'occurrences', 'list', { categoryId: null, status: null }])).toEqual([report])
  await userEvent.click(screen.getByRole('link', { name: report.title }))
  expect(await screen.findByText(report.description)).toBeVisible()
  expect(client.getQueryData(['private', person.id, 'occurrences', 'detail', report.id])).toEqual(report)
  expect(fetchMock.mock.calls[2][0]).toBe(`https://api.example.com/api/occurrences/${report.id}`)
  expect(fetchMock.mock.calls[2][1]).toMatchObject({ credentials: 'omit', redirect: 'error', headers: { Authorization: 'Bearer synthetic-token' } })
})

test.each(['network', 'invalid', 403, 503] as const)('list %s preserves session, hides internals and supports manual retry', async failure => {
  if (failure === 'network') fetchMock.mockImplementationOnce(() => Promise.reject(new Error('private server details')))
  else if (failure === 'invalid') fetchMock.mockResolvedValueOnce(Response.json([{ ...report, status: 'UNKNOWN' }]))
  else fetchMock.mockResolvedValueOnce(Response.json({ message: 'private server details' }, { status: failure }))
  fetchMock.mockResolvedValueOnce(Response.json([]))
  renderPage()
  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('Não conseguimos carregar seus relatos')
  expect(alert).not.toHaveTextContent('private server details')
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(sessionStorage.getItem(STORAGE_KEY)).not.toBeNull()
  await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
  expect(await screen.findByText('Você ainda não registrou relatos')).toBeVisible()
  expect(fetchMock).toHaveBeenCalledTimes(3)
})

test.each(['/meus-relatos', `/meus-relatos/${report.id}`])('401 at %s ends session and removes private cache', async path => {
  fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }))
  const { client } = renderPage(path)
  expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeVisible()
  expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()
  await waitFor(() => expect(client.getQueryCache().findAll({ queryKey: ['private'] })).toHaveLength(0))
})

test('detail 404 hides private data and permits retry', async () => {
  fetchMock.mockResolvedValueOnce(Response.json({ message: 'private server details' }, { status: 404 }))
    .mockResolvedValueOnce(Response.json(report))
  renderPage(`/meus-relatos/${report.id}`)
  expect(await screen.findByRole('alert')).toHaveTextContent('Ele pode não existir ou não pertencer à sua conta')
  expect(screen.queryByText(report.title)).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
  expect(await screen.findByText(report.description)).toBeVisible()
})

test('malformed detail id does not issue a private occurrence request', async () => {
  renderPage('/meus-relatos/invalid-id')
  expect(await screen.findByRole('alert')).toBeVisible()
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

test.each(['IN_ANALYSIS', 'RESOLVED', 'REJECTED'])('author reads %s history without edit or delete controls', async status => {
  fetchMock.mockResolvedValueOnce(Response.json({ ...report, status, version: 1, history: [{
    id: '6e85aa3d-19e3-42a3-8861-c435ff5908af', previousStatus: status === 'RESOLVED' ? 'IN_ANALYSIS' : 'PENDING', newStatus: status,
    occurredAt: '2026-10-15T12:00:00Z', responsible: 'Moderação', reason: status === 'REJECTED' ? 'Imagem não corresponde ao local.' : null,
  }] }))
  renderPage(`/meus-relatos/${report.id}`)
  expect(await screen.findByRole('heading', { name: 'Histórico do relato' })).toBeVisible()
  expect(screen.getByText(/Moderação/)).toBeVisible()
  expect(screen.queryByRole('link', { name: 'Editar relato' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Excluir relato' })).not.toBeInTheDocument()
  if (status === 'REJECTED') {
    expect(screen.getByText(/Justificativa: Imagem não corresponde ao local/)).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Por que foi rejeitado?' })).toBeVisible()
    expect(screen.getByText('Imagem não corresponde ao local.', { exact: true })).toBeVisible()
  }
})

function mockFlow(initial: Occurrence = { ...report, status: 'PENDING' }) {
  let current = { ...initial }
  let removed = false
  similarFetch.mockReset().mockImplementation(() => Promise.resolve(Response.json({ radiusMeters: 100, limit: 5, items: [] })))
  fetchMock.mockReset().mockImplementation(async (url, options) => {
    const path = String(url)
    if (path.endsWith('/api/auth/me')) return Response.json(person)
    if (path.endsWith('/occurrence-categories')) return Response.json([{ id: 1, name: 'Iluminação pública' }])
    if ((path.endsWith('/image') || path.includes('/media/'))) return new Response('photo', { headers: { 'Content-Type': 'image/png' } })
    if (options?.method === 'PUT') {
      const body = options.body as FormData
      current = { ...current, title: String(body.get('title')), description: String(body.get('description')), version: current.version + 1 }
      return Response.json(current)
    }
    if (options?.method === 'DELETE') { removed = true; return new Response(null, { status: 204 }) }
    return Response.json(path.endsWith('/occurrences') ? removed ? [] : [current] : current)
  })
  vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: vi.fn(() => 'blob:private-photo'), revokeObjectURL: vi.fn() }))
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new Event('close')) }
}

test('private photo sends Bearer, remains outside query cache and releases URL on unmount', async () => {
  mockFlow()
  const view = renderPage(`/meus-relatos/${report.id}`)
  expect(await screen.findByRole('img', { name: `Foto do problema: ${report.title}` })).toHaveAttribute('src', 'blob:private-photo')
  const photo = fetchMock.mock.calls.find(([url]) => (String(url).endsWith('/image') || String(url).includes('/media/')))!
  expect(photo[1]).toMatchObject({ credentials: 'omit', headers: { Authorization: 'Bearer synthetic-token' } })
  expect(view.client.getQueryCache().findAll({ queryKey: ['private', person.id, 'occurrences'] })).toHaveLength(1)
  expect(view.client.getQueryCache().getAll().some(query => query.queryKey.includes('image'))).toBe(false)
  view.unmount()
  expect(view.client.getQueryCache().findAll({ queryKey: ['private'] })).toHaveLength(0)
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:private-photo')
})

test('editing starts with existing fields, keeps photo and invalidates list after confirmed PUT', async () => {
  mockFlow()
  const { client } = renderPage(`/meus-relatos/${report.id}/editar`)
  client.setQueryData(['public', 'occurrences', 'markers'], { items: [], total: 0, located: 0, unlocated: 0 })
  client.setQueryData(['private', person.id, 'occurrences', 'markers', { categoryId: null, status: null }], { items: [], total: 0, located: 0, unlocated: 0 })
  await screen.findByRole('button', { name: 'Continuar' })
  await screen.findByRole('button', { name: 'Continuar' })
  fireEvent.click(screen.getByRole('button', {name:'Continuar'}))
  fireEvent.click(screen.getByRole('button', {name:'Continuar'}))
  await screen.findByRole('option', { name: 'Iluminação pública' })
  expect(screen.getByLabelText('Título')).toHaveValue(report.title)
  expect(screen.getByLabelText('Detalhes (opcional)')).toHaveValue(report.description)
  const title = 'Poste ainda apagado na praça'
  fireEvent.change(screen.getByLabelText('Título'), { target: { value: title } })
  fireEvent.change(screen.getByLabelText('Detalhes (opcional)'), { target: { value: '' } })
  await userEvent.click(screen.getByRole('button', { name: 'Revisar relato' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Salvar alterações' }))
  expect(await screen.findByRole('heading', { name: title, level: 1 })).toBeVisible()
  const put = fetchMock.mock.calls.find(([, options]) => options?.method === 'PUT')!
  expect(put[1]?.headers).toMatchObject({ 'If-Match': '"0"', Authorization: 'Bearer synthetic-token' })
  expect((put[1]?.body as FormData).has('image')).toBe(false)
  expect((put[1]?.body as FormData).has('latitude')).toBe(false)
  expect((put[1]?.body as FormData).has('longitude')).toBe(false)
  expect(similarFetch).not.toHaveBeenCalled()
  expect((put[1]?.body as FormData).get('description')).toBe('')
  expect(client.getQueryData(['private', person.id, 'occurrences', 'detail', report.id])).toMatchObject({ title, version: 1 })
  expect(client.getQueryData(['private', person.id, 'occurrences', 'markers', { categoryId: null, status: null }])).toBeUndefined()
  expect(client.getQueryState(['public', 'occurrences', 'markers'])?.isInvalidated).toBe(true)
  expect(screen.queryByText(report.id)).not.toBeInTheDocument()
})

test('cancel editing returns to detail without PUT', async () => {
  mockFlow(); renderPage(`/meus-relatos/${report.id}/editar`)
  await userEvent.click(await screen.findByRole('link', { name: 'Cancelar edição' }))
  expect(await screen.findByRole('heading', { name: report.title })).toBeVisible()
  expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'PUT')).toBe(false)
})

test('delete dialog focuses Cancel, cancel sends nothing and confirmed delete clears detail', async () => {
  mockFlow()
  const { client } = renderPage(`/meus-relatos/${report.id}`)
  await userEvent.click(await screen.findByRole('button', { name: 'Excluir relato' }))
  expect(screen.getByRole('dialog')).toHaveTextContent(report.title)
  expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus()
  await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
  expect(screen.getByRole('button', { name: 'Excluir relato' })).toHaveFocus()
  expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'DELETE')).toBe(false)
  await userEvent.click(screen.getByRole('button', { name: 'Excluir relato' }))
  const confirm = within(screen.getByRole('dialog')).getByRole('button', { name: 'Excluir relato' })
  fireEvent.click(confirm); fireEvent.click(confirm)
  expect(await screen.findByText('Relato excluído.')).toBeVisible()
  const calls = fetchMock.mock.calls.filter(([, options]) => options?.method === 'DELETE')
  expect(calls).toHaveLength(1)
  expect(calls[0][1]?.headers).toMatchObject({ 'If-Match': '"0"' })
  await waitFor(() => expect(client.getQueryData(['private', person.id, 'occurrences', 'detail', report.id])).toBeUndefined())
  expect(await screen.findByText('Você ainda não registrou relatos')).toBeVisible()
})

test.each([412, 409, 503])('delete failure %s preserves detail and session without false success', async code => {
  mockFlow(); renderPage(`/meus-relatos/${report.id}`)
  await userEvent.click(await screen.findByRole('button', { name: 'Excluir relato' }))
  fetchMock.mockResolvedValueOnce(Response.json({ code: 'FAILED' }, { status: code }))
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Excluir relato' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(code === 412 ? 'Este relato mudou' : code === 409 ? 'não pode mais ser alterado' : 'Não foi possível confirmar')
  expect(screen.queryByText('Relato excluído.')).not.toBeInTheDocument()
  expect(sessionStorage.getItem(STORAGE_KEY)).not.toBeNull()
  expect(screen.getByRole('heading', { name: report.title })).toBeVisible()
})

test('session ending cancels late image and never creates its object URL', async () => {
  mockFlow()
  let resolve!: (response: Response) => void
  const flow = fetchMock.getMockImplementation()!
  fetchMock.mockImplementation((url, options) => (String(url).endsWith('/image') || String(url).includes('/media/'))
    ? new Promise<Response>(done => { resolve = done }) : flow(url, options))
  renderPage(`/meus-relatos/${report.id}`)
  await screen.findByRole('heading', { name: report.title })
  await waitFor(() => expect(resolve).toBeDefined())
  fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }))
  await userEvent.click(within(screen.getByRole('main')).getByRole('link', { name: /Meus relatos/ }))
  await screen.findByRole('heading', { name: 'Entrar' })
  await act(async () => resolve(new Response('photo', { headers: { 'Content-Type': 'image/png' } })))
  expect(URL.createObjectURL).not.toHaveBeenCalled()
  expect(screen.queryByRole('img', { name: `Foto do problema: ${report.title}` })).not.toBeInTheDocument()
})

test('replacement selection uses ImagePicker and one PUT while upload controls stay locked', async () => {
  mockFlow()
  let decode: (() => void) | null = null
  vi.stubGlobal('Image', class {
    naturalWidth = 20; naturalHeight = 10; onerror = null
    set onload(callback: () => void) { decode = callback }
    set src(_value: string) { /* Decoder is controlled by this test. */ }
  })
  renderPage(`/meus-relatos/${report.id}/editar`)
  await screen.findByRole('button', { name: 'Continuar' })
  fireEvent.click(screen.getByRole('button', {name:'Continuar'}))
  fireEvent.click(screen.getByRole('button', {name:'Continuar'}))
  await screen.findByRole('option', { name: 'Iluminação pública' })
  fireEvent.click(screen.getByRole('button', {name: '1. Foto ou vídeo'}))
  const file = new File(['replacement'], 'new.png', { type: 'image/png' })
  fireEvent.change(screen.getByLabelText('Arquivo de imagem'), { target: { files: [file] } })
  expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled()
  await waitFor(() => expect(decode).not.toBeNull())
  await act(async () => decode?.())
  let resolve!: (response: Response) => void
  fetchMock.mockImplementationOnce(() => new Promise<Response>(done => { resolve = done }))
  fireEvent.click(screen.getByRole('button', {name:'Continuar'}))
  fireEvent.click(screen.getByRole('button', {name:'Continuar'}))
  fireEvent.click(screen.getByRole('button', {name:'Revisar relato'}))
  const confirm = await screen.findByRole('button', { name: 'Salvar alterações' })
  fireEvent.click(confirm); fireEvent.click(confirm)
  expect(fetchMock.mock.calls.filter(([, options]) => options?.method === 'PUT')).toHaveLength(1)
  expect(screen.getByLabelText('Título')).toBeDisabled()
  expect(screen.getByLabelText('Arquivo de imagem')).toBeDisabled()
  expect(screen.getByRole('link', { name: 'Cancelar edição' })).toHaveAttribute('aria-disabled','true')
  const put = fetchMock.mock.calls.find(([, options]) => options?.method === 'PUT')!
  expect((put[1]?.body as FormData).get('images')).toMatchObject({ name: file.name, size: file.size, type: file.type })
  await act(async () => resolve(Response.json({ ...report, version: 1 })))
  expect(await screen.findByRole('heading', { name: report.title, level: 1 })).toBeVisible()
})

test('edit conflict preserves draft and offers a fresh consultation without retry', async () => {
  mockFlow(); renderPage(`/meus-relatos/${report.id}/editar`)
  await screen.findByRole('button', { name: 'Continuar' })
  fireEvent.click(screen.getByRole('button', {name:'Continuar'}))
  fireEvent.click(screen.getByRole('button', {name:'Continuar'}))
  await screen.findByRole('option', { name: 'Iluminação pública' })
  fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Meu rascunho preservado' } })
  fetchMock.mockResolvedValueOnce(Response.json({ code: 'VERSION_CHANGED' }, { status: 412 }))
  await userEvent.click(screen.getByRole('button', { name: 'Revisar relato' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Salvar alterações' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Este relato mudou')
  expect(screen.getByLabelText('Título')).toHaveValue('Meu rascunho preservado')
  expect(screen.getByRole('link', { name: 'Consultar relato novamente' })).toBeVisible()
  expect(fetchMock.mock.calls.filter(([, options]) => options?.method === 'PUT')).toHaveLength(1)
})

test('empty list to registration to private detail refreshes cache in the same session', async () => {
  mockFlow()
  let created = false
  const flow = fetchMock.getMockImplementation()!
  fetchMock.mockImplementation(async (url, options) => {
    if (options?.method === 'POST' && String(url).endsWith('/occurrences')) {
      created = true
      return Response.json({ ...report, description: null }, { status: 201 })
    }
    if (String(url).endsWith('/occurrences') && !created) return Response.json([])
    return flow(url, options)
  })
  let decode: (() => void) | null = null
  vi.stubGlobal('Image', class {
    naturalWidth = 20; naturalHeight = 10; onerror = null
    set onload(callback: () => void) { decode = callback }
    set src(_value: string) { /* Controlled decoder. */ }
  })
  const { client } = renderPage()
  await screen.findByText('Você ainda não registrou relatos')
  await userEvent.click(screen.getByRole('link', { name: 'Registrar problema' }))
  await screen.findByRole('button', { name: 'Continuar' })
  fireEvent.change(screen.getByLabelText('Arquivo de imagem'), { target: { files: [new File(['photo'], 'photo.png', { type: 'image/png' })] } })
  await waitFor(() => expect(decode).not.toBeNull())
  await act(async () => decode?.())
  fireEvent.click(screen.getByRole('button', {name:'Escolher no mapa'}))
  for (const [label, value] of [['Bairro', report.neighborhood], ['Ponto de referência', report.reference]])
    fireEvent.change(screen.getByLabelText(label), {target: {value}})
  fireEvent.click(screen.getByRole('button', {name:'Continuar'}))
  await screen.findByRole('option', {name:'Iluminação pública'})
  fireEvent.change(screen.getByLabelText('Categoria'), {target:{value:'1'}})
  fireEvent.change(screen.getByLabelText('Título'), {target:{value:report.title}})
  fireEvent.click(screen.getByRole('button', {name:'Revisar relato'}))
  await userEvent.click(await screen.findByRole('button', {name:'Enviar relato'}))
  await screen.findByRole('heading', { name: 'Relato registrado' })
  expect(screen.queryByText(report.id)).not.toBeInTheDocument()
  await userEvent.click(within(screen.getByRole('main')).getByRole('link', { name: 'Meus relatos' }))
  await screen.findByRole('heading', { name: report.title })
  expect(client.getQueryData(['private', person.id, 'occurrences', 'list', { categoryId: null, status: null }])).toEqual([report])
  await userEvent.click(screen.getByRole('link', { name: report.title }))
  expect(await screen.findByRole('img', { name: `Foto do problema: ${report.title}` })).toBeVisible()
})


test('a background detail read cannot upgrade the version of an existing draft', async () => {
  mockFlow()
  const { client } = renderPage(`/meus-relatos/${report.id}/editar`)
  await screen.findByRole('button', { name: 'Continuar' })
  fireEvent.click(screen.getByRole('button', {name:'Continuar'}))
  fireEvent.click(screen.getByRole('button', {name:'Continuar'}))
  await screen.findByRole('option', { name: 'Iluminação pública' })
  fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Rascunho da versão antiga' } })
  await act(async () => { client.setQueryData(['private', person.id, 'occurrences', 'detail', report.id], { ...report, title: 'Alteração de outra aba', version: 1 }) })
  fetchMock.mockResolvedValueOnce(Response.json({ code: 'VERSION_CHANGED' }, { status: 412 }))
  await userEvent.click(screen.getByRole('button', { name: 'Revisar relato' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Salvar alterações' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Este relato mudou')
  const put = fetchMock.mock.calls.find(([, options]) => options?.method === 'PUT')!
  expect(put[1]?.headers).toMatchObject({ 'If-Match': '"0"' })
  expect(screen.getByLabelText('Título')).toHaveValue('Rascunho da versão antiga')
})


test('editing restores and resends a confirmed zero-axis point; changing drafts needs confirmation', async () => {
  mockFlow({ ...report, status: 'PENDING', latitude: 0, longitude: 123.123456789 })
  renderPage(`/meus-relatos/${report.id}/editar`)
  await screen.findByRole('button', { name: 'Continuar' })
  fireEvent.click(screen.getByRole('button', {name:'Continuar'}))
  fireEvent.click(screen.getByRole('button', {name:'Continuar'}))
  await screen.findByRole('option', { name: 'Iluminação pública' })
  expect(screen.queryByLabelText('Latitude')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Revisar relato' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Salvar alterações' }))
  const put = fetchMock.mock.calls.find(([, options]) => options?.method === 'PUT')!
  expect((put[1]?.body as FormData).get('latitude')).toBe('0')
  expect((put[1]?.body as FormData).get('longitude')).toBe('123.123456789')
  expect(JSON.parse(similarFetch.mock.calls[0][1]?.body as string)).toEqual({ categoryId: 1, latitude: 0, longitude: 123.123456789, excludeOccurrenceId: report.id })
})
test('pending legacy can voluntarily confirm its first point', async () => {
  mockFlow(); renderPage(`/meus-relatos/${report.id}/editar`)
  await screen.findByRole('button', { name: 'Continuar' })
  fireEvent.click(screen.getByRole('button', {name:'Continuar'}))
  fireEvent.click(screen.getByRole('button', {name:'Continuar'}))
  await screen.findByRole('option', { name: 'Iluminação pública' })
  fireEvent.click(screen.getByRole('button', {name:'2. Localização'}))
  expect(screen.getByText('Nenhum local confirmado.')).toBeVisible()
  fireEvent.click(screen.getByRole('button', {name:'Escolher no mapa'}))
  fireEvent.click(screen.getByRole('button', {name:'Continuar'}))
  await userEvent.click(screen.getByRole('button', { name: 'Revisar relato' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Salvar alterações' }))
  const put = fetchMock.mock.calls.find(([, options]) => options?.method === 'PUT')!
  expect((put[1]?.body as FormData).get('latitude')).toBe('-12.34')
  expect((put[1]?.body as FormData).get('longitude')).toBe('45.67')
})

test('visited media stays mounted: private cover preview is reused in review and after return without extra fetches', async () => {
  mockFlow();const view=renderPage(`/meus-relatos/${report.id}/editar`)
  await screen.findByRole('img',{name:`Foto do problema: ${report.title}`})
  const downloads=()=>fetchMock.mock.calls.filter(([url])=>String(url).includes('/media/')).length
  expect(downloads()).toBe(1)
  fireEvent.click(screen.getByRole('button',{name:'Continuar'}));fireEvent.click(screen.getByRole('button',{name:'Continuar'}))
  await screen.findByRole('option',{name:'Iluminação pública'})
  fireEvent.click(screen.getByRole('button',{name:'Revisar relato'}))
  expect(screen.getByRole('img',{name:'Capa do relato em revisão'})).toHaveAttribute('src','blob:private-photo')
  fireEvent.click(screen.getByRole('button',{name:'Editar mídia'}))
  expect(screen.getByRole('img',{name:`Foto do problema: ${report.title}`})).toHaveAttribute('src','blob:private-photo')
  expect(downloads()).toBe(1);expect(URL.revokeObjectURL).not.toHaveBeenCalled()
  view.unmount();expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:private-photo')
})
test('editing saved video keeps only metadata through all steps and saves manifest without downloading or resending bytes', async()=>{
  mockFlow({...report,status:'PENDING',media:[{id:report.media[0].id,type:'VIDEO',mime:'video/mp4',sizeBytes:100,position:0,durationSeconds:2,width:320,height:240,endpoint:'/api/occurrences/example/media/example'}]})
  renderPage(`/meus-relatos/${report.id}/editar`);await screen.findByRole('button',{name:'Continuar'})
  expect(screen.getByText('Etapa 1 de 4')).toBeVisible()
  fireEvent.click(screen.getByRole('button',{name:'Continuar'}));fireEvent.click(screen.getByRole('button',{name:'Continuar'}))
  await screen.findByRole('option',{name:'Iluminação pública'})
  fireEvent.click(screen.getByRole('button',{name:'Revisar relato'}))
  expect(fetchMock.mock.calls.filter(([url])=>String(url).includes('/media/'))).toHaveLength(0)
  fireEvent.click(await screen.findByRole('button',{name:'Salvar alterações'}))
  await waitFor(()=>expect(fetchMock.mock.calls.some(([,opts])=>opts?.method==='PUT')).toBe(true))
  const body=fetchMock.mock.calls.find(([,opts])=>opts?.method==='PUT')![1]!.body as FormData
  expect(body.has('video')).toBe(false);expect(body.has('images')).toBe(false);expect(body.has('media')).toBe(true)
})

test('hiding media cancels a stalled private response body; late bytes cannot create a preview', async()=>{
  mockFlow();const flow=fetchMock.getMockImplementation()!
  const canceled=vi.fn();let attempts=0
  fetchMock.mockImplementation((url,options)=>String(url).includes('/media/')&&attempts++===0
    ? Promise.resolve(new Response(new ReadableStream<Uint8Array>({cancel:canceled}),{headers:{'Content-Type':'image/png'}}))
    : flow(url,options))
  renderPage(`/meus-relatos/${report.id}/editar`)
  await waitFor(()=>expect(attempts).toBe(1))
  fireEvent.click(screen.getByRole('button',{name:'Continuar'}))
  await waitFor(()=>expect(canceled).toHaveBeenCalledOnce())
  expect(URL.createObjectURL).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'Voltar'}))
  await screen.findByRole('img',{name:`Foto do problema: ${report.title}`})
  expect(URL.createObjectURL).toHaveBeenCalledOnce()
})

import { withEmptyNotifications } from '../test/notification-fixture'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { MemoryRouter } from 'react-router'
import { beforeEach, expect, test, vi } from 'vitest'
import App from '../App'
import { AuthProvider } from '../features/auth/AuthProvider'
import { STORAGE_KEY } from '../features/auth/auth'

vi.mock('../features/location/LocationMap', () => ({ LocationMap: ({onSelect}: {onSelect: (p: {latitude:number;longitude:number}) => void}) => <button type="button" onClick={() => onSelect({latitude:-23.55052,longitude:-46.633308})}>Escolher no mapa</button> }))

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
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  vi.stubGlobal('isSecureContext', false)
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
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
  fireEvent.change(screen.getByLabelText(camera ? 'Fotografia pela câmera' : 'Fotos ou vídeo da galeria'), { target: { files: [file] } })
  return file
}
async function finish(fail = false) {
  await act(async () => { if (fail) images.at(-1)?.onerror?.(); else images.at(-1)?.onload?.() })
}
async function fill(strict = false) {
  const view = strict ? renderStrict() : renderPage()
  await screen.findByRole('button', {name:'Adicionar foto ou vídeo'})
  choose(); await finish()
  fireEvent.click(screen.getByRole('button', {name:'Continuar'}))
  await screen.findByRole('heading', {name:'2 de 4 · Localização'})
  fireEvent.click(screen.getByRole('button', {name:'Escolher no mapa'}))
  for (const [label,value] of [['Bairro','Centro'],['Ponto de referência','Ao lado da escola']]) fireEvent.change(screen.getByLabelText(label),{target:{value}})
  fireEvent.click(screen.getByRole('button', {name:'Continuar'}))
  await screen.findByRole('option', {name:'Iluminação pública'})
  fireEvent.change(screen.getByLabelText('Categoria'),{target:{value:'1'}})
  fireEvent.change(screen.getByLabelText('Título'),{target:{value:'  Poste apagado 💡  '}})
  return view
}
function renderStrict() {
  const client = new QueryClient({defaultOptions:{queries:{retry:false}}})
  // Identity bootstrap also probes effects under Strict Mode; return fresh responses on each request.
  fetchMock.mockReset().mockImplementation(url => Promise.resolve(Response.json(String(url).endsWith('/auth/me') ? person : [{id:1,name:'Iluminação pública'}])))
  const view=render(<StrictMode><QueryClientProvider client={client}><AuthProvider><MemoryRouter initialEntries={['/registrar-ocorrencia']}><App /></MemoryRouter></AuthProvider></QueryClientProvider></StrictMode>)
  return {client,...view}
}
function reviewForm() { fireEvent.click(screen.getByRole('button',{name:'Revisar'})) }
async function submit() {
  reviewForm()
  await screen.findByText('Não encontramos relatos semelhantes nesta consulta')
  const confirm=screen.getByRole('button',{name:'Enviar'})
  fireEvent.click(confirm); fireEvent.click(confirm)
}
const candidate = {id:'c50062d3-9ac2-4e70-86fa-eac5249f4d0c',categoryId:1,categoryName:'Iluminação pública',title:'Outro poste apagado',neighborhood:'Centro',reference:'Próximo à escola',status:'PENDING',createdAt:'2026-10-19T12:00:00Z',distanceMeters:32.4}

test('starts with only media; empty, invalid and pending selections never advance or upload', async () => {
  renderPage(); await screen.findByRole('button',{name:'Continuar'})
  expect(screen.queryByLabelText('Bairro')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Categoria')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'Continuar'}))
  expect(screen.getByRole('button',{name:'Adicionar foto ou vídeo'})).toHaveFocus()
  fireEvent.change(screen.getByLabelText('Fotos ou vídeo da galeria'),{target:{files:[]}})
  choose('invalid.gif',false,'image/gif'); await finish()
  expect(screen.getByText('1 de 4 · Foto ou vídeo')).toBeVisible()
  choose(); expect(screen.getByRole('button',{name:'Continuar'})).toBeDisabled()
  expect(similarFetch).not.toHaveBeenCalled()
  expect(fetchMock).toHaveBeenCalledTimes(2)
})
test('decoded photos stay until Continue; going back permits additions/order/cover and retains URLs', async () => {
  await fill()
  const initialUrls=vi.mocked(URL.createObjectURL).mock.calls.length
  fireEvent.click(screen.getByRole('button',{name:'1. Foto ou vídeo'}))
  choose('second.png',true); await finish()
  expect(screen.getByText('1 de 4 · Foto ou vídeo')).toBeVisible()
  fireEvent.click(screen.getByRole('button',{name:'Selecionar foto 2'}))
  fireEvent.click(screen.getByRole('button',{name:'Definir foto 2 como capa'}))
  expect(screen.getByRole('img',{name:'Prévia da foto 1'})).toBeVisible()
  expect(vi.mocked(URL.createObjectURL).mock.calls.length).toBeGreaterThan(initialUrls)
  fireEvent.click(screen.getByRole('button',{name:'Continuar'}))
  expect(screen.getByLabelText('Bairro')).toHaveValue('Centro')
  expect(screen.getByText('Local confirmado.')).toBeVisible()
  fireEvent.click(screen.getByRole('button',{name:'Continuar'}))
  expect(screen.getByLabelText('Título')).toHaveValue('  Poste apagado 💡  ')
  reviewForm(); await screen.findByText('Não encontramos relatos semelhantes nesta consulta')
  expect(screen.getByRole('img',{name:'Capa do relato em revisão'})).toBeVisible()
  expect(fetchMock).toHaveBeenCalledTimes(2)
})
test('step validation, keyboard submit and future-step controls cannot bypass required point or fields', async () => {
  renderPage();await screen.findByRole('button',{name:'Continuar'});choose();await finish()
  fireEvent.click(screen.getByRole('button',{name:'Continuar'}))
  fireEvent.submit(screen.getByRole('button',{name:'Continuar'}).closest('form')!)
  fireEvent.click(screen.getByRole('button',{name:'Continuar'}))
  expect(screen.getByText('2 de 4 · Localização')).toBeVisible()
  expect(screen.getByText('Confirme o local real do problema.')).toBeVisible()
  expect(screen.getByRole('button',{name:'4. Revisão'})).toBeDisabled()
  expect(similarFetch).not.toHaveBeenCalled()
})
test('only explicit final action writes one authenticated multipart; pending locks navigation and success releases resources', async () => {
  await fill()
  let resolve!: (r:Response)=>void
  fetchMock.mockImplementationOnce(()=>new Promise(done=>{resolve=done}))
  await submit()
  expect(fetchMock).toHaveBeenCalledTimes(3)
  const options=fetchMock.mock.calls[2][1]!
  expect(options.headers).toEqual({Authorization:'Bearer synthetic-token'})
  expect(options.credentials).toBe('omit')
  const body=options.body as FormData
  expect([...body.keys()]).toEqual(['categoryId','title','description','neighborhood','reference','latitude','longitude','images'])
  expect(body.get('title')).toBe('Poste apagado 💡')
  expect(body.get('latitude')).toBe('-23.55052')
  expect((body.get('images') as File).name).toBe('photo.png')
  expect(screen.getByRole('button',{name:'Voltar'})).toBeDisabled()
  expect(screen.getByLabelText('Título')).toBeDisabled()
  expect(screen.getByText('Enviando…')).toBeVisible()
  await act(async()=>resolve(Response.json(result,{status:201})))
  expect(await screen.findByRole('heading',{name:'Relato registrado'})).toHaveFocus()
  expect(URL.revokeObjectURL).toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'Relatar outro problema'}))
  expect(screen.getByText('1 de 4 · Foto ou vídeo')).toBeVisible()
})
test.each(['','  ','Muito lixo.','😀'.repeat(1000)])('preserves optional description contract (%s)',async description=>{
  await fill(); fireEvent.change(screen.getByLabelText('Detalhes (opcional)'),{target:{value:description}})
  fetchMock.mockResolvedValueOnce(Response.json(result,{status:201}));await submit()
  await screen.findByText('Relato registrado')
  expect((fetchMock.mock.calls[2][1]?.body as FormData).get('description')).toBe(description.trim())
})
test('1001 Unicode points stay on information without lookup or upload',async()=>{
  await fill();fireEvent.change(screen.getByLabelText('Detalhes (opcional)'),{target:{value:'😀'.repeat(1001)}});reviewForm()
  expect(screen.getByLabelText('Detalhes (opcional)')).toHaveFocus()
  expect(similarFetch).not.toHaveBeenCalled()
})
test('review lookup uses exact criteria once, preserves draft and opens public detail separately',async()=>{
  await fill();similarFetch.mockResolvedValueOnce(Response.json({radiusMeters:100,limit:5,items:[candidate]}));reviewForm()
  await screen.findByText(candidate.title)
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(JSON.parse(similarFetch.mock.calls[0][1]?.body as string)).toEqual({categoryId:1,latitude:-23.55052,longitude:-46.633308})
  const link=screen.getByRole('link',{name:'Consultar relato (abre em nova aba)'})
  expect(link).toHaveAttribute('target','_blank');expect(link).toHaveAttribute('rel','noopener noreferrer')
  fireEvent.click(screen.getByRole('button',{name:'Editar informações'}))
  fireEvent.change(screen.getByLabelText('Título'),{target:{value:'Texto atual na revisão'}})
  reviewForm();await screen.findByText(candidate.title)
  expect(similarFetch).toHaveBeenCalledTimes(1)
  fetchMock.mockResolvedValueOnce(Response.json(result,{status:201}))
  fireEvent.click(screen.getByRole('button',{name:'Enviar'}))
  await screen.findByText('Relato registrado')
  expect((fetchMock.mock.calls[2][1]?.body as FormData).get('title')).toBe('Texto atual na revisão')
})
test('Strict Mode does not double query or advance twice',async()=>{
  await fill(true)
  expect(screen.getByText('3 de 4 · Informações')).toBeVisible()
  reviewForm();await screen.findByText('Não encontramos relatos semelhantes nesta consulta')
  expect(similarFetch).toHaveBeenCalledTimes(1)
})
test('leaving review cancels slow lookup; altered criteria invalidate old response without writing',async()=>{
  const view=await fill();let resolve!: (r:Response)=>void
  similarFetch.mockImplementationOnce(()=>new Promise(done=>{resolve=done}));reviewForm()
  await screen.findByText('Consultando relatos próximos…')
  const signal=similarFetch.mock.calls[0][1]?.signal
  fireEvent.click(screen.getByRole('button',{name:'Editar informações'}))
  expect(signal?.aborted).toBe(true)
  // Clearing category invalidates the context and prevents reopening revision.
  fireEvent.change(screen.getByLabelText('Categoria'),{target:{value:''}});reviewForm()
  await act(async()=>resolve(Response.json({radiusMeters:100,limit:5,items:[candidate]})))
  expect(screen.queryByText(candidate.title)).not.toBeInTheDocument()
  expect(fetchMock).toHaveBeenCalledTimes(2)
  view.unmount();expect(view.client.getQueryCache().findAll({queryKey:['private']})).toHaveLength(0)
})
test.each(['network','503','schema'])('auxiliary %s is distinct from empty and allows explicit bypass',async failure=>{
  await fill()
  if(failure==='network')similarFetch.mockRejectedValueOnce(new TypeError('secret'))
  else similarFetch.mockResolvedValueOnce(Response.json(failure==='schema'?{}:{code:'UNAVAILABLE'},{status:failure==='503'?503:200}))
  reviewForm();await screen.findByText('Não foi possível consultar relatos semelhantes')
  expect(screen.queryByText('Não encontramos relatos semelhantes nesta consulta')).not.toBeInTheDocument()
  expect(fetchMock).toHaveBeenCalledTimes(2)
  fetchMock.mockResolvedValueOnce(Response.json(result,{status:201}))
  fireEvent.click(screen.getByRole('button',{name:'Enviar mesmo assim'}));await screen.findByText('Relato registrado')
})
test('manual lookup refresh is available after success, without writing',async()=>{
  await fill();reviewForm();await screen.findByText('Não encontramos relatos semelhantes nesta consulta')
  fireEvent.click(screen.getByRole('button',{name:'Consultar novamente'}));await waitFor(()=>expect(similarFetch).toHaveBeenCalledTimes(2))
  expect(fetchMock).toHaveBeenCalledTimes(2)
})
test.each([401,403])('lookup %s respects auth contracts',async status=>{
  await fill();similarFetch.mockResolvedValueOnce(Response.json({},{status}));reviewForm()
  if(status===401){await screen.findByRole('heading',{name:'Entrar'});expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()}
  else {await screen.findByText('Sua conta não tem acesso à consulta de relatos semelhantes.');expect(screen.queryByRole('button',{name:'Enviar mesmo assim'})).not.toBeInTheDocument();expect(sessionStorage.getItem(STORAGE_KEY)).not.toBeNull()}
})
test.each([
  [400,{code:'VALIDATION_ERROR',fieldErrors:{title:['private']}},3,'Confira os campos'],
  [400,{code:'VALIDATION_ERROR',fieldErrors:{neighborhood:['private']}},2,'Confira os campos'],
  [400,{code:'INVALID_VIDEO'},1,'completo e legível'],
  [413,{code:'IMAGE_TOO_LARGE'},1,'5 MiB'],
  [502,{code:'IMAGE_STORAGE_UNAVAILABLE'},4,'serviço de fotos'],
  [409,{},4,'não pode mais'],[412,{},4,'Este relato mudou'],[428,{},4,'Este relato mudou'],[503,{code:'MEDIA_BUSY'},4,'indisponível ou ocupado'],
] as const)('backend %s routes errors to step %s and keeps files/text',async(status,payload,step,message)=>{
  await fill();fetchMock.mockResolvedValueOnce(Response.json(payload,{status}));await submit()
  await waitFor(() => expect(screen.getAllByText(new RegExp(message)).some(node => node.getAttribute('role') === 'alert' || node.closest('[role="alert"]'))).toBe(true))
  expect(screen.getByRole('heading', { name: new RegExp(`^${step} de 4`) })).toBeVisible()
  expect(screen.getByLabelText('Título')).toHaveValue('  Poste apagado 💡  ')
  expect(screen.getByLabelText('Fotos ou vídeo da galeria')).toBeInTheDocument()
  expect(fetchMock).toHaveBeenCalledTimes(3)
})
test.each(['network','malformed','wrong-status'])('uncertain %s never retries writing and keeps risk warning when correcting',async failure=>{
  await fill()
  if(failure==='network')fetchMock.mockRejectedValueOnce(new TypeError('secret'))
  else fetchMock.mockResolvedValueOnce(failure==='malformed'?new Response('invalid',{status:201}):Response.json(result,{status:200}))
  await submit();await screen.findByText(/reenviar pode criar um relato duplicado/)
  fireEvent.click(screen.getByRole('button',{name:'Editar mídia'}))
  expect(screen.getByText(/reenviar pode criar um relato duplicado/)).toBeVisible()
  expect(fetchMock).toHaveBeenCalledTimes(3)
})
test('new video stays until Continue, pauses on hiding and review never fetches or autoplays video',async()=>{
  renderPage();await screen.findByRole('button',{name:'Adicionar foto ou vídeo'})
  fireEvent.change(screen.getByLabelText('Vídeo pela câmera'),{target:{files:[new File(['x'],'invalid.mov',{type:'video/quicktime'})]}})
  expect(screen.getByText('1 de 4 · Foto ou vídeo')).toBeVisible()
  fireEvent.change(screen.getByLabelText('Vídeo pela câmera'),{target:{files:[new File(['video'],'synthetic.mp4',{type:'video/mp4'})]}})
  expect(screen.getByText('1 de 4 · Foto ou vídeo')).toBeVisible()
  fireEvent.click(screen.getByRole('button',{name:'Continuar'}))
  await screen.findByRole('heading',{name:'2 de 4 · Localização'})
  expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled()
  expect(screen.getByLabelText('Prévia local do vídeo')).not.toHaveAttribute('autoplay')
  expect(fetchMock).toHaveBeenCalledTimes(2)
})
test('dirty cancellation protects draft; declining discard keeps all media and beforeunload is registered',async()=>{
  await fill();vi.mocked(window.confirm).mockReturnValue(false)
  await userEvent.click(screen.getByRole('link',{name:'Cancelar'}))
  expect(window.confirm).toHaveBeenCalledOnce();expect(screen.getByLabelText('Título')).toHaveValue('  Poste apagado 💡  ')
  const unload=new Event('beforeunload',{cancelable:true});window.dispatchEvent(unload);expect(unload.defaultPrevented).toBe(true)
})

test('category failure is recoverable without losing media/location/text or fabricating a category',async()=>{
  fetchMock.mockReset().mockResolvedValueOnce(Response.json(person)).mockResolvedValueOnce(Response.json({},{status:503}))
  renderPage();await screen.findByRole('button',{name:'Adicionar foto ou vídeo'});choose();await finish()
  fireEvent.click(screen.getByRole('button',{name:'Continuar'}))
  fireEvent.click(screen.getByRole('button',{name:'Escolher no mapa'}))
  fireEvent.change(screen.getByLabelText('Bairro'),{target:{value:'Centro'}})
  fireEvent.change(screen.getByLabelText('Ponto de referência'),{target:{value:'Perto da escola'}})
  fireEvent.click(screen.getByRole('button',{name:'Continuar'}))
  await screen.findByRole('button',{name:'Carregar categorias novamente'})
  fireEvent.change(screen.getByLabelText('Título'),{target:{value:'Rascunho preservado'}})
  fetchMock.mockResolvedValueOnce(Response.json([{id:1,name:'Iluminação pública'}]))
  fireEvent.click(screen.getByRole('button',{name:'Carregar categorias novamente'}))
  await screen.findByRole('option',{name:'Iluminação pública'})
  expect(screen.getByLabelText('Título')).toHaveValue('Rascunho preservado')
  expect(screen.getByLabelText('Bairro')).toHaveValue('Centro')
  expect(similarFetch).not.toHaveBeenCalled()
})

test('video replacement stays on revisited media and sends current video bytes only on final confirmation',async()=>{
  await fill();fireEvent.click(screen.getByRole('button',{name:'1. Foto ou vídeo'}))
  fireEvent.change(screen.getByLabelText('Vídeo pela câmera'),{target:{files:[new File(['video'],'synthetic.mp4',{type:'video/mp4'})]}})
  fireEvent.click(screen.getByRole('button',{name:'Trocar mídia'}))
  expect(screen.getByText('1 de 4 · Foto ou vídeo')).toBeVisible()
  fireEvent.click(screen.getByRole('button',{name:'Continuar'}));fireEvent.click(screen.getByRole('button',{name:'Continuar'}))
  fetchMock.mockResolvedValueOnce(Response.json({code:'VIDEO_VALIDATION_BUSY'},{status:503}))
  await submit();await screen.findByText(/O serviço de mídia está indisponível ou ocupado/)
  const body=fetchMock.mock.calls[2][1]?.body as FormData
  expect(body.getAll('video')).toHaveLength(1);expect(body.getAll('images')).toHaveLength(0)
  expect(body.get('video')).toMatchObject({name:'upload.mp4',type:'video/mp4'})
  expect(fetchMock).toHaveBeenCalledTimes(3)
  expect(screen.getByLabelText('Título')).toHaveValue('  Poste apagado 💡  ')
})

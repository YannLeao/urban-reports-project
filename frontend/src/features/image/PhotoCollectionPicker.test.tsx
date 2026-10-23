import { useState } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'
import { MediaPicker } from './MediaPicker'
import { appendPhotoDraft, type PhotoDraft } from './photo-draft'
import { OccurrenceGallery } from '../occurrence/OccurrenceGallery'
import type { Occurrence } from '../occurrence/occurrence'

const request = vi.fn<(path: string, method: string, signal?: AbortSignal) => Promise<Response>>()
const identity = { user: { id: 'citizen' }, status: 'authenticated' }
vi.mock('../auth/auth', () => ({ useAuth: () => ({ state: identity, request }) }))
const ids = ['050062d3-9ac2-4e70-86fa-eac5249f4d0c', '150062d3-9ac2-4e70-86fa-eac5249f4d0c', '250062d3-9ac2-4e70-86fa-eac5249f4d0c']
const report: Occurrence = { id: ids[0], title: 'Poste apagado', categoryId: 1, categoryName: 'Luz', description: null, neighborhood: 'Centro', reference: 'Praça', status: 'PENDING', version: 0, latitude: null, longitude: null, createdAt: '2026-10-01T00:00:00Z', media: ids.map((id, position) => ({ id, position, type: 'IMAGE', mime: 'image/png', sizeBytes: null, endpoint: '/api/occurrences/example/media/' + id })) }
let serial = 0
beforeEach(() => {
  serial = 0; request.mockReset(); identity.user.id = 'citizen'
  vi.stubEnv('VITE_API_URL', 'https://api.example.com')
  vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: vi.fn(() => `blob:photo-${serial++}`), revokeObjectURL: vi.fn() }))
  vi.stubGlobal('Image', class {
    onload: (() => void) | null = null; onerror: (() => void) | null = null
    naturalWidth = 10; naturalHeight = 10
    set src(value: string) { if (value) queueMicrotask(() => this.onload?.()) }
  })
})
function Picker({ initial = [] }: { initial?: PhotoDraft[] }) {
  const [photos, setPhotos] = useState(initial)
  const [mode, setMode] = useState<'IMAGE' | 'VIDEO'>('IMAGE')
  return <MediaPicker mode={mode} onMode={setMode} value={photos} onChange={setPhotos} existing={initial.length ? report : undefined} onValidationChange={() => {}} />
}
function choose(count: number, camera = false, type = 'image/png') {
  const files = Array.from({ length: count }, (_, i) => new File(['synthetic'], `${i}.png`, { type }))
  fireEvent.change(screen.getByLabelText(camera ? 'Fotografia pela câmera' : 'Fotos ou vídeo da galeria'), { target: { files } })
  return files
}
function readBlob(blob: Blob) {
  return new Promise<string>(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result as string); reader.readAsText(blob) })
}
test('gallery appends photos and camera adds one; navigation is independent of order and removal selects a neighbour', async () => {
  render(<Picker />)
  expect(screen.getByLabelText('Fotos ou vídeo da galeria')).toHaveAttribute('multiple')
  choose(3); await screen.findByText('3 de 5 fotos')
  expect(await screen.findByRole('img', { name: 'Prévia da foto 1' })).toBeVisible()
  await userEvent.click(screen.getByRole('button', { name: 'Próxima foto' }))
  expect(screen.getByRole('img', { name: 'Prévia da foto 2' })).toBeVisible()
  expect(screen.getByRole('button', { name: 'Selecionar foto 1, capa' })).toHaveAttribute('aria-pressed', 'false')
  choose(1, true); await screen.findByText('4 de 5 fotos')
  choose(2); expect(screen.getByRole('alert')).toHaveTextContent('máximo 5')
  expect(screen.getByText('4 de 5 fotos')).toBeVisible()
  choose(1, false, 'image/gif'); await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Formato'))
  await userEvent.click(screen.getByRole('button', { name: 'Remover foto 2' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Selecionar foto 2' })).toHaveFocus())
  choose(1); await screen.findByText('4 de 5 fotos')
})
test('cover/order actions preserve selected File and URLs; removal/unmount free each owned preview', async () => {
  const view = render(<Picker />)
  choose(3); await screen.findByText('3 de 5 fotos')
  const original = (await screen.findByRole('img', { name: 'Prévia da foto 1' })).getAttribute('src')
  await userEvent.click(screen.getByRole('button', { name: 'Selecionar foto 3' }))
  const third = screen.getByRole('img', { name: 'Prévia da foto 3' }).getAttribute('src')
  await userEvent.click(screen.getByRole('button', { name: 'Definir foto 3 como capa' }))
  expect(screen.getByRole('img', { name: 'Prévia da foto 1' })).toHaveAttribute('src', third)
  await userEvent.click(screen.getByText('Organizar fotos'))
  await userEvent.click(screen.getByRole('button', { name: 'Mover foto 1 para depois' }))
  expect(screen.getByRole('img', { name: 'Prévia da foto 2' })).toHaveAttribute('src', third)
  await userEvent.click(screen.getByRole('button', { name: 'Foto anterior' }))
  expect(screen.getByRole('img', { name: 'Prévia da foto 1' })).toHaveAttribute('src', original)
  await userEvent.click(screen.getByRole('button', { name: 'Remover foto 1' }))
  expect(URL.revokeObjectURL).toHaveBeenCalledWith(original)
  view.unmount(); expect(URL.revokeObjectURL).toHaveBeenCalledWith(third)
})
test('five photos keep one active preview, limit is clear, removing last restores capture', async () => {
  render(<Picker />); choose(5); await screen.findByText('5 de 5 fotos')
  expect(screen.queryByRole('button', { name: 'Adicionar fotos' })).not.toBeInTheDocument()
  for (let remaining = 5; remaining > 0; remaining--) {
    await userEvent.click(screen.getByRole('button', { name: 'Remover foto 1' }))
  }
  expect(screen.getByRole('button', { name: 'Adicionar foto ou vídeo' })).toBeEnabled()
  expect(screen.queryByRole('button', { name: 'Foto anterior' })).not.toBeInTheDocument()
})
test('manifest follows visual order and sends only new bytes', async () => {
  const file = new File(['synthetic'], 'photo.png', { type: 'image/png' })
  const body = new FormData()
  appendPhotoDraft(body, [{ key: ids[1], id: ids[1] }, { key: 'new', file }, { key: ids[0], id: ids[0] }], true)
  expect(body.getAll('images')).toHaveLength(1)
  expect(JSON.parse(await readBlob(body.get('media') as Blob))).toEqual({ items: [{ id: ids[1] }, { uploadIndex: 0 }, { id: ids[0] }] })
})
test('existing photos can be removed and reordered without uploading originals', async () => {
  request.mockImplementation(async () => new Response('synthetic', { headers: { 'Content-Type': 'image/png' } }))
  render(<Picker initial={ids.map(id => ({ key: id, id }))} />)
  await userEvent.click(screen.getByRole('button', { name: 'Remover foto 1' }))
  expect(screen.getByText('2 de 5 fotos')).toBeVisible()
  await userEvent.click(screen.getByRole('button', { name: 'Selecionar foto 2' }))
  await userEvent.click(screen.getByRole('button', { name: 'Definir foto 2 como capa' }))
  expect(screen.getByText('1 de 2 · Capa')).toBeVisible()
})
test('saved editor reuses completed previews for navigation and thumbnails without decorating downloads', async () => {
  request.mockImplementation(async () => new Response('synthetic', { headers: { 'Content-Type': 'image/png' } }))
  const view = render(<Picker initial={ids.map(id => ({ key: id, id }))} />)
  const photo = await screen.findByRole('img', { name: `Foto do problema: ${report.title}` })
  const first = photo.getAttribute('src')
  expect(request).toHaveBeenCalledTimes(1)
  await userEvent.click(screen.getByRole('button', { name: 'Selecionar foto 2' }))
  await waitFor(() => expect(screen.getByRole('img', { name: `Foto do problema: ${report.title}` })).not.toHaveAttribute('src', first))
  expect(request).toHaveBeenCalledTimes(2)
  await userEvent.click(screen.getByRole('button', { name: 'Selecionar foto 1, capa' }))
  expect(screen.getByRole('img', { name: `Foto do problema: ${report.title}` })).toHaveAttribute('src', first)
  expect(request).toHaveBeenCalledTimes(2)
  expect(URL.revokeObjectURL).not.toHaveBeenCalled()
  view.unmount(); expect(URL.revokeObjectURL).toHaveBeenCalledWith(first)
})
test('private gallery downloads only selected photo, cancels stale requests and revokes URLs across account change', async () => {
  let resolve!: (response: Response) => void
  request.mockImplementationOnce(() => new Promise<Response>(done => { resolve = done }))
    .mockImplementation(async () => new Response('synthetic', { headers: { 'Content-Type': 'image/png' } }))
  const view = render(<OccurrenceGallery report={report} />)
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1))
  const signal = request.mock.calls[0][2] as AbortSignal | undefined
  await userEvent.click(screen.getByRole('button', { name: 'Próxima foto' }))
  expect(signal?.aborted).toBe(true)
  await screen.findByRole('img')
  const url = screen.getByRole('img').getAttribute('src')
  await act(async () => resolve(new Response('late', { headers: { 'Content-Type': 'image/png' } })))
  expect(screen.getByRole('img')).toHaveAttribute('src', url)
  identity.user.id = 'other'; view.rerender(<OccurrenceGallery report={report} />)
  await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith(url))
  view.unmount()
})
test('public gallery selects application media endpoint and single photo has no navigation', async () => {
  const view = render(<OccurrenceGallery report={report} publicView />)
  expect(screen.getAllByRole('img')).toHaveLength(1)
  expect(screen.getByRole('img')).toHaveAttribute('src', `https://api.example.com/api/public/occurrences/${report.id}/media/${ids[0]}`)
  await userEvent.click(screen.getByRole('button', { name: 'Próxima foto' }))
  expect(screen.getByRole('img')).toHaveAttribute('src', `https://api.example.com/api/public/occurrences/${report.id}/media/${ids[1]}`)
  expect(request).not.toHaveBeenCalled()
  view.rerender(<OccurrenceGallery report={{ ...report, media: report.media!.slice(0, 1) }} publicView />)
  expect(screen.queryByRole('button', { name: 'Próxima foto' })).not.toBeInTheDocument()
})

test('a failed private photo does not carry its error into the next selected photo', async () => {
  let resolve!: (response: Response) => void
  request.mockRejectedValueOnce(new Error('synthetic failure')).mockImplementationOnce(() => new Promise<Response>(done => { resolve = done }))
  render(<OccurrenceGallery report={report} />)
  await screen.findByText('Não foi possível carregar a foto.')
  await userEvent.click(screen.getByRole('button', { name: 'Próxima foto' }))
  expect(screen.getByText('Carregando foto…')).toBeVisible()
  await act(async () => resolve(new Response('synthetic', { headers: { 'Content-Type': 'image/png' } })))
  expect(screen.getByRole('img')).toBeVisible()
})

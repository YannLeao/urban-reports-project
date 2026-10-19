import { useState } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'
import { PhotoCollectionPicker } from './PhotoCollectionPicker'
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
  return <PhotoCollectionPicker value={photos} onChange={setPhotos} existing={initial.length ? report : undefined} />
}
function choose(count: number, camera = false, type = 'image/png') {
  const files = Array.from({ length: count }, (_, i) => new File(['synthetic'], `${i}.png`, { type }))
  fireEvent.change(screen.getByLabelText(camera ? 'Fotografia pela câmera' : 'Arquivo de imagem'), { target: { files } })
  return files
}
function readBlob(blob: Blob) {
  return new Promise<string>(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result as string); reader.readAsText(blob) })
}
test('gallery appends multiple photos and camera adds one; rejects sixth and invalid batch without losing selection', async () => {
  render(<Picker />)
  expect(screen.getByLabelText('Arquivo de imagem')).toHaveAttribute('multiple')
  choose(3); await screen.findByText(/3\/5 fotos/)
  choose(1, true); await screen.findByText(/4\/5 fotos/)
  choose(2); expect(screen.getByRole('alert')).toHaveTextContent('máximo 5')
  expect(screen.getAllByRole('img')).toHaveLength(4)
  choose(1, false, 'image/gif'); await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Foto 5'))
  expect(screen.getAllByRole('img')).toHaveLength(4)
  await userEvent.click(screen.getByRole('button', { name: 'Remover foto 2' }))
  expect(screen.getByRole('button', { name: 'Tirar foto' })).toHaveFocus()
  choose(1); await screen.findByText(/4\/5 fotos/)
})
test('accessible reordering changes cover and frees all local previews on removal/unmount', async () => {
  const view = render(<Picker />)
  choose(3); await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(3))
  const original = screen.getAllByRole('img').map(image => image.getAttribute('src'))
  await userEvent.click(screen.getByRole('button', { name: 'Definir foto 3 como capa' }))
  expect(screen.getAllByRole('img')[0]).toHaveAttribute('src', original[2])
  await userEvent.click(screen.getByRole('button', { name: 'Mover foto 1 para depois' }))
  expect(screen.getAllByRole('img')[0]).toHaveAttribute('src', original[0])
  await userEvent.click(screen.getByRole('button', { name: 'Remover foto 1' }))
  expect(URL.revokeObjectURL).toHaveBeenCalledWith(original[0])
  view.unmount()
  for (const url of original) expect(URL.revokeObjectURL).toHaveBeenCalledWith(url)
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
  expect(screen.getByText(/2\/5 fotos/)).toBeVisible()
  await userEvent.click(screen.getByRole('button', { name: 'Definir foto 2 como capa' }))
  expect(screen.getByText('Foto 1 · Capa')).toBeVisible()
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

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { MediaPicker } from './MediaPicker'
import { appendPhotoDraft, type PhotoDraft } from './photo-draft'

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:local'), revokeObjectURL: vi.fn() }))
})
function Example() {
  const [mode, setMode] = useState<'IMAGE' | 'VIDEO'>('IMAGE')
  const [items, setItems] = useState<PhotoDraft[]>([{ key: 'old', id: 'photo-id' }])
  return <><MediaPicker mode={mode} onMode={setMode} value={items} onChange={setItems} onValidationChange={() => {}} /><output>{mode}/{items.length}/{items[0]?.id ?? items[0]?.file?.name}</output></>
}
it('classifies gallery/capture, confirms type changes and preserves previous selection on cancel/invalid batches', () => {
  render(<Example />)
  const input = screen.getByLabelText('Fotos ou vídeo da galeria')
  const file = new File(['synthetic'], 'synthetic.mp4', { type: 'video/mp4' })
  fireEvent.change(input, { target: { files: [file] } })
  expect(screen.getByRole('dialog')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
  expect(screen.getByText('IMAGE/1/photo-id')).toBeVisible()
  fireEvent.change(input, { target: { files: [file] } })
  fireEvent.click(screen.getByRole('button', { name: 'Trocar mídia' }))
  expect(screen.getByText('VIDEO/1/synthetic.mp4')).toBeVisible()
  fireEvent.change(input, { target: { files: [new File(['new'], 'replacement.mp4', { type: 'video/mp4' })] } })
  expect(screen.getByRole('heading', { name: 'Substituir mídia?' })).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
  expect(screen.getByText('VIDEO/1/synthetic.mp4')).toBeVisible()
  for (const files of [[new File(['x'], 'x.mov', { type: 'video/quicktime' })], [file, file], [file, new File(['x'], 'x.png', { type: 'image/png' })]]) {
    fireEvent.change(input, { target: { files } })
    expect(screen.getByRole('alert')).toHaveTextContent('seleção anterior foi mantida')
    expect(screen.getByText('VIDEO/1/synthetic.mp4')).toBeVisible()
  }
  expect(screen.getByLabelText('Vídeo pela câmera')).toHaveAttribute('capture', 'environment')
  expect(screen.getByLabelText('Fotografia pela câmera')).toHaveAttribute('capture', 'environment')
  fireEvent.click(screen.getByRole('button', { name: 'Câmera' }))
  expect(screen.getByRole('button', { name: 'Fotografar' })).toBeVisible()
  expect(screen.getByRole('button', { name: 'Gravar vídeo' })).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Remover vídeo' }))
  expect(screen.getByRole('button', { name: 'Adicionar foto ou vídeo' })).toHaveFocus()
})
it('video draft uses one video upload and final replacement manifest with no client metadata', async () => {
  const body = new FormData()
  appendPhotoDraft(body, [{ key: 'new', file: new File(['synthetic'], 'local.mp4', { type: 'video/mp4' }) }], true, 'VIDEO')
  expect(body.getAll('video')).toHaveLength(1); expect(body.getAll('images')).toHaveLength(0)
  expect(await (body.get('media') as Blob).text()).toBe('{"items":[{"uploadIndex":0}]}')
  expect([...body.keys()]).toEqual(['video', 'media'])
})

function LocalDraft() {
  const [mode, setMode] = useState<'IMAGE' | 'VIDEO'>('IMAGE')
  const [items, setItems] = useState<PhotoDraft[]>([])
  return <><MediaPicker mode={mode} onMode={setMode} value={items} onChange={setItems} onValidationChange={() => {}} />
    <output aria-label="Rascunho">{JSON.stringify({ mode, keys: items.map(item => item.key), names: items.map(item => item.file?.name) })}</output></>
}
it.each([
  ['Fotografia pela câmera', 'image/png', 'IMAGE'],
  ['Fotos ou vídeo da galeria', 'image/png', 'IMAGE'],
  ['Vídeo pela câmera', 'video/mp4', 'VIDEO'],
  ['Fotos ou vídeo da galeria', 'video/mp4', 'VIDEO'],
])('accepts %s (%s) without crypto.randomUUID on insecure HTTP', async (label, mime, mode) => {
  vi.stubGlobal('isSecureContext', false)
  vi.stubGlobal('crypto', {})
  vi.stubGlobal('Image', class {
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    naturalWidth = 10; naturalHeight = 10
    set src(value: string) { if (value) queueMicrotask(() => this.onload?.()) }
  })
  render(<LocalDraft />)
  const file = new File(['synthetic'], mime === 'video/mp4' ? 'test.mp4' : 'test.png', { type: mime })
  fireEvent.change(screen.getByLabelText(label), { target: { files: [file] } })
  await waitFor(() => expect(screen.getByLabelText('Rascunho')).toHaveTextContent(file.name))
  expect(screen.getByLabelText('Rascunho')).toHaveTextContent(mode)
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  if (mode === 'IMAGE') {
    fireEvent.change(screen.getByLabelText(label), { target: { files: [file] } })
    await screen.findByText('2 de 5 fotos')
    const draft = JSON.parse(screen.getByLabelText('Rascunho').textContent!) as { keys: string[] }
    expect(new Set(draft.keys).size).toBe(2)
    fireEvent.click(screen.getByRole('button', { name: 'Remover foto 1' }))
    fireEvent.change(screen.getByLabelText(label), { target: { files: [file] } })
    await screen.findByText('2 de 5 fotos')
    const next = JSON.parse(screen.getByLabelText('Rascunho').textContent!) as { keys: string[] }
    expect(new Set(next.keys).size).toBe(2)
    expect(next.keys[1]).not.toBe(draft.keys[0])
  }
})

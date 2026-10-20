import { fireEvent, render, screen } from '@testing-library/react'
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
it('requires confirmation before clearing, cancelling preserves photos, invalid choice preserves video', () => {
  render(<Example />)
  fireEvent.click(screen.getByRole('button', { name: 'Vídeo' }))
  expect(screen.getByRole('dialog')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
  expect(screen.getByRole('status', { name: '' })).toHaveTextContent('IMAGE/1/photo-id')
  fireEvent.click(screen.getByRole('button', { name: 'Vídeo' }))
  fireEvent.click(screen.getByRole('button', { name: 'Trocar mídia' }))
  expect(screen.getByRole('status', { name: '' })).toHaveTextContent('VIDEO/0/')
  const input = screen.getByLabelText('Escolher vídeo')
  const file = new File(['synthetic'], 'synthetic.mp4', { type: 'video/mp4' })
  fireEvent.change(input, { target: { files: [file] } })
  expect(screen.getByRole('status', { name: '' })).toHaveTextContent('VIDEO/1/synthetic.mp4')
  fireEvent.change(input, { target: { files: [new File(['invalid'], 'x.mov', { type: 'video/quicktime' })] } })
  expect(screen.getByRole('alert')).toHaveTextContent('seleção anterior foi mantida')
  expect(screen.getByRole('status', { name: '' })).toHaveTextContent('VIDEO/1/synthetic.mp4')
})
it('video draft uses one video upload and final replacement manifest with no client metadata', async () => {
  const body = new FormData()
  appendPhotoDraft(body, [{ key: 'new', file: new File(['synthetic'], 'local.mp4', { type: 'video/mp4' }) }], true, 'VIDEO')
  expect(body.getAll('video')).toHaveLength(1); expect(body.getAll('images')).toHaveLength(0)
  expect(await (body.get('media') as Blob).text()).toBe('{"items":[{"uploadIndex":0}]}')
  expect([...body.keys()]).toEqual(['video', 'media'])
})

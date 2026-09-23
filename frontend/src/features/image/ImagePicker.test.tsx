import { StrictMode, useState } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'
import { ImagePicker } from './ImagePicker'
import { checkImageDecoding, MAX_IMAGE_BYTES, validateImageFile } from './image-file'

const changed = vi.fn()
const created = vi.fn<(file: Blob) => string>()
const revoked = vi.fn()
let images: FakeImage[]
class FakeImage {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  naturalWidth = 20
  naturalHeight = 10
  src = ''
  constructor() { images.push(this) }
}
function Harness() {
  const [file, setFile] = useState<File | null>(null)
  return <ImagePicker value={file} onChange={next => { changed(next); setFile(next) }} />
}
function file(name = 'photo.png', type = 'image/png', size = 10) {
  return new File([new Uint8Array(size)], name, { type })
}
function choose(next?: File, camera = false) {
  fireEvent.change(screen.getByLabelText(camera ? 'Fotografia pela câmera' : 'Arquivo de imagem'), { target: { files: next ? [next] : [] } })
}
async function finish(index = images.length - 1, fail = false) {
  await act(async () => { if (fail) images[index].onerror?.(); else images[index].onload?.() })
}
beforeEach(() => {
  images = []
  changed.mockReset()
  created.mockReset().mockImplementation(() => `blob:local-${created.mock.calls.length}`)
  revoked.mockReset()
  vi.stubGlobal('Image', FakeImage)
  vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: created, revokeObjectURL: revoked }))
})

test.each([
  ['empty', '', 'image/png', 0, 'vazio'],
  ['invalid', 'x.gif', 'image/gif', 1, 'Formato'],
  ['missing MIME', 'x.png', '', 1, 'Formato'],
  ['unknown MIME', 'x.png', 'application/octet-stream', 1, 'Formato'],
  ['HEIC', 'x.heic', 'image/heic', 1, 'HEIC/HEIF'],
  ['oversize', 'x.png', 'image/png', MAX_IMAGE_BYTES + 1, '5 MiB'],
])('rejects %s', (_case, name, type, size, message) => {
  expect(validateImageFile(file(name, type, size))).toContain(message)
})
test.each(['image/jpeg', 'image/png', 'image/webp'])('accepts exact byte limit for %s', type => {
  expect(validateImageFile(file('photo', type, MAX_IMAGE_BYTES))).toBeNull()
})

test('selection, replacement, removal and same-file reselection propagate the File and release URLs', async () => {
  const user = userEvent.setup()
  const view = render(<StrictMode><Harness /></StrictMode>)
  const first = file()
  choose(first)
  expect(screen.getByRole('status')).toHaveTextContent('Verificando')
  expect(screen.getByRole('button', { name: 'Escolher imagem' })).toBeDisabled()
  await finish()
  expect(changed).toHaveBeenLastCalledWith(first)
  const firstURL = screen.getByRole('img').getAttribute('src')
  expect(revoked).not.toHaveBeenCalledWith(firstURL)
  expect(screen.getByLabelText('Arquivo de imagem')).toHaveValue('')
  choose(file('second.png'))
  expect(revoked).not.toHaveBeenCalledWith(firstURL)
  await finish()
  expect(revoked).toHaveBeenCalledWith(firstURL)
  await user.click(screen.getByRole('button', { name: 'Remover imagem' }))
  expect(changed).toHaveBeenLastCalledWith(null)
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Escolher imagem' })).toHaveFocus()
  choose(first)
  await finish()
  expect(changed).toHaveBeenLastCalledWith(first)
  view.unmount()
  expect(revoked.mock.calls.map(([url]) => url).sort()).toEqual(created.mock.results.map(result => result.value as string).sort())
})

test('cancel and invalid attempts preserve previous image; decoding errors release only candidate', async () => {
  render(<Harness />)
  const first = file()
  choose(first)
  await finish()
  const url = screen.getByRole('img').getAttribute('src')
  choose()
  fireEvent(screen.getByLabelText('Fotografia pela câmera'), new Event('cancel'))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(changed).toHaveBeenCalledTimes(1)
  choose(file('bad.png', '', 1))
  expect(screen.getByRole('alert')).toHaveTextContent('A imagem anterior foi mantida')
  choose(file('broken.png'))
  await finish(undefined, true)
  expect(screen.getByRole('alert')).toHaveTextContent('Não conseguimos abrir')
  expect(screen.getByRole('img')).toHaveAttribute('src', url)
  expect(revoked).not.toHaveBeenCalledWith(url)
  expect(changed).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: 'Remover imagem' }))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('stale reads cannot replace newer selection or restore removed selection', async () => {
  render(<Harness />)
  choose(file('old.png'))
  const oldLoad = images[0].onload
  const latest = file('latest.png')
  choose(latest)
  await finish()
  await act(async () => oldLoad?.())
  expect(changed).toHaveBeenCalledTimes(1)
  expect(changed).toHaveBeenLastCalledWith(latest)
  choose(file('pending.png'))
  const pendingLoad = images.at(-1)?.onload
  fireEvent.click(screen.getByRole('button', { name: 'Remover imagem' }))
  await act(async () => pendingLoad?.())
  expect(changed).toHaveBeenLastCalledWith(null)
  expect(changed).toHaveBeenCalledTimes(2)
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
})

test('external reset and unmount cancel validation and release resources even before load', async () => {
  const first = file()
  const view = render(<ImagePicker value={first} onChange={changed} />)
  choose(file('pending.png'))
  view.rerender(<ImagePicker value={null} onChange={changed} />)
  await finish()
  expect(changed).not.toHaveBeenCalled()
  choose(file())
  const lastLoad = images.at(-1)?.onload
  view.unmount()
  await act(async () => lastLoad?.())
  expect(changed).not.toHaveBeenCalled()
  expect(revoked).toHaveBeenCalledTimes(created.mock.calls.length)
})

test('native camera and alternative picker open directly; neither accepts multiple files', async () => {
  const user = userEvent.setup()
  render(<Harness />)
  const camera = screen.getByLabelText('Fotografia pela câmera')
  const alternative = screen.getByLabelText('Arquivo de imagem')
  expect(camera).toHaveAttribute('capture', 'environment')
  expect(alternative).not.toHaveAttribute('capture')
  for (const input of [camera, alternative]) {
    expect(input).not.toHaveAttribute('multiple')
    expect(input).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp')
  }
  const cameraClick = vi.spyOn(camera, 'click')
  const fileClick = vi.spyOn(alternative, 'click')
  await user.click(screen.getByRole('button', { name: 'Tirar foto' }))
  expect(cameraClick).toHaveBeenCalledOnce()
  await user.click(screen.getByRole('button', { name: 'Escolher imagem' }))
  expect(fileClick).toHaveBeenCalledOnce()
  choose(file(), true)
  await finish()
  expect(changed).toHaveBeenCalledOnce()
})

test('decode handles already-aborted requests and zero dimensions', async () => {
  const controller = new AbortController()
  controller.abort()
  await expect(checkImageDecoding(file(), controller.signal)).rejects.toThrow('Aborted')
  const promise = checkImageDecoding(file(), new AbortController().signal)
  const assertion = expect(promise).rejects.toThrow('Invalid image')
  images.at(-1)!.naturalWidth = 0
  await finish()
  await assertion
  await waitFor(() => expect(revoked).toHaveBeenCalledTimes(2))
})

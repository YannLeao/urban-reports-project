import { StrictMode } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'
import { AuthContext, type AuthContextValue } from '../auth/auth'
import type { Occurrence } from './occurrence'
import { OccurrenceGallery } from './OccurrenceGallery'
import { ReviewPhotos } from './ReviewPhotos'

const request = vi.fn<AuthContextValue['request']>()
const media: NonNullable<Occurrence['media']> = Array.from({ length: 5 }, (_, i) => ({ id: `00000000-0000-4000-8000-00000000000${i + 1}`, type: 'IMAGE', mime: 'image/png', sizeBytes: 10, position: i, endpoint: '/unused' }))
const report: Occurrence = { id: '00000000-0000-4000-8000-000000000099', title: 'Praça sintética', description: null, categoryId: 1, categoryName: 'Iluminação', neighborhood: 'Centro', reference: 'Praça', version: 0, status: 'PENDING', createdAt: '2026-11-01T12:00:00Z', latitude: null, longitude: null, media }
function auth(id = 'owner'): AuthContextValue { return { state: { status: 'authenticated', user: { id, name: 'Pessoa', email: 'synthetic@example.com', role: 'USER' } }, sessionSignal: new AbortController().signal, request, login: vi.fn(), logout: vi.fn(), retry: vi.fn() } }
beforeEach(() => {
  request.mockReset().mockImplementation(async () => new Response('synthetic-photo', { headers: { 'Content-Type': 'image/png' } }))
  let n = 0
  vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: vi.fn(() => `blob:photo-${++n}`), revokeObjectURL: vi.fn() }))
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new Event('close')) }
})

test('five thumbnails keep recorded order, cover and selection; modal reuses bytes and returns focus', async () => {
  const view = render(<StrictMode><AuthContext value={auth()}><OccurrenceGallery report={report} administrative /></AuthContext></StrictMode>)
  await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(5))
  expect(request).toHaveBeenCalledTimes(5)
  expect(request.mock.calls.map(call => call[0])).toEqual(media.map(item => `/api/admin/occurrences/${report.id}/media/${item.id}`))
  expect(screen.getByRole('button', { name: 'Selecionar foto 1, capa' })).toHaveAttribute('aria-pressed', 'true')
  await userEvent.click(screen.getByRole('button', { name: 'Selecionar foto 3' }))
  expect(screen.getByRole('img', { name: `Foto 3 do problema: ${report.title}` })).toHaveAttribute('src', 'blob:photo-3')
  expect(screen.getByRole('button', { name: 'Selecionar foto 3' })).toHaveAttribute('aria-pressed', 'true')
  const trigger = screen.getByRole('button', { name: 'Ampliar foto' })
  await userEvent.click(trigger)
  const dialog = screen.getByRole('dialog', { name: 'Foto ampliada' })
  expect(within(dialog).getByRole('img')).toHaveAttribute('src', 'blob:photo-3')
  expect(within(dialog).getByRole('button', { name: 'Fechar' })).toHaveFocus()
  await userEvent.click(within(dialog).getByRole('button', { name: 'Fechar' }))
  expect(trigger).toHaveFocus()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(request).toHaveBeenCalledTimes(5)
  expect(URL.revokeObjectURL).not.toHaveBeenCalled()
  view.unmount()
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(5)
})

test('one photo has amplification without redundant thumbnail navigation', async () => {
  render(<AuthContext value={auth()}><OccurrenceGallery report={{ ...report, media: media.slice(0, 1) }} /></AuthContext>)
  await screen.findByRole('img', { name: `Foto do problema: ${report.title}` })
  expect(screen.queryByRole('button', { name: /Selecionar foto/ })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Ampliar foto' })).toBeEnabled()
  expect(request).toHaveBeenCalledTimes(1)
})

test('a failed image keeps the frame and does not prevent selecting another photo', async () => {
  request.mockRejectedValueOnce(new Error('synthetic failure'))
  const view = render(<AuthContext value={auth()}><OccurrenceGallery report={report} /></AuthContext>)
  await screen.findByText('Não foi possível carregar a foto. Você pode escolher outra imagem.')
  expect(screen.getByRole('button', { name: 'Ampliar foto' })).toBeDisabled()
  await userEvent.click(screen.getByRole('button', { name: 'Selecionar foto 2' }))
  expect(await screen.findByRole('img', { name: `Foto 2 do problema: ${report.title}` })).toBeVisible()
  expect(screen.getByRole('button', { name: 'Ampliar foto' })).toBeEnabled()
  fireEvent.error(view.container.querySelector('div[hidden] img')!)
  expect(screen.getByText('Não foi possível carregar a foto. Você pode escolher outra imagem.')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Ampliar foto' })).toBeDisabled()
})

test('changing authentication context revokes old URLs and aborts pending media', async () => {
  const view = render(<AuthContext value={auth()}><OccurrenceGallery report={report} /></AuthContext>)
  await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(5))
  const signals = request.mock.calls.map(call => call[2])
  request.mockImplementation(() => new Promise(() => {}))
  view.rerender(<AuthContext value={auth('another')}><OccurrenceGallery report={report} /></AuthContext>)
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(5)
  expect(signals.every(signal => signal?.aborted)).toBe(true)
  expect(screen.queryByRole('img', { name: /Foto .*do problema/ })).not.toBeInTheDocument()
  await act(async () => { view.unmount() })
  expect(request.mock.calls.every(call => call[2]?.aborted)).toBe(true)
})

test('review previews amplify from memory without creating or downloading another photo', async () => {
  const photos = media.map(item => ({ key: item.id, id: item.id }))
  const previews = Object.fromEntries(photos.map((photo, i) => [photo.key, `blob:draft-${i}`]))
  render(<ReviewPhotos photos={photos} previews={previews} existing={report} active disabled={false} />)
  expect(screen.getByRole('region', { name: 'Fotos em revisão' })).toBeVisible()
  await userEvent.click(screen.getByRole('button', { name: 'Ampliar foto 4 da revisão' }))
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).getByRole('img')).toHaveAttribute('src', 'blob:draft-3')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Fechar' }))
  expect(screen.getByRole('button', { name: 'Ampliar foto 4 da revisão' })).toHaveFocus()
  expect(request).not.toHaveBeenCalled()
  expect(URL.createObjectURL).not.toHaveBeenCalled()
  expect(URL.revokeObjectURL).not.toHaveBeenCalled()
})

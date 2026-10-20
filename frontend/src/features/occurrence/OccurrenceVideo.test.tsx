import { StrictMode } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi, beforeEach } from 'vitest'
import { AuthContext, type AuthContextValue } from '../auth/auth'
import { OccurrenceVideo } from './OccurrenceVideo'
import { OccurrenceGallery } from './OccurrenceGallery'
import { OccurrencePhoto } from './OccurrencePhoto'
import { PublicOccurrencePhoto } from './PublicOccurrencePhoto'
import type { Occurrence } from './occurrence'

const report: Occurrence = { id: '00000000-0000-4000-8000-000000000001', categoryId: 1, categoryName: 'Luz', title: 'Poste apagado', description: null, neighborhood: 'Centro', reference: 'Praça central', latitude: null, longitude: null, version: 0, createdAt: '2026-10-20T00:00:00Z', status: 'PENDING', media: [{ id: '00000000-0000-4000-8000-000000000002', type: 'VIDEO', mime: 'video/mp4', sizeBytes: 3, position: 0, endpoint: '/unused', durationSeconds: 1, width: 320, height: 240 }] }
const request = vi.fn<AuthContextValue['request']>()
function auth(id = 'author'): AuthContextValue { return { sessionSignal: new AbortController().signal, state: { status: 'authenticated', user: { id, name: 'Pessoa', email: 'synthetic@example.com', role: 'USER' } }, request, login: vi.fn(), logout: vi.fn(), retry: vi.fn() } }
beforeEach(() => {
  request.mockReset()
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:synthetic'), revokeObjectURL: vi.fn() }))
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
})
it('cards and map photos use placeholder without fetching video or image', () => {
  const { container } = render(<AuthContext value={auth()}><OccurrencePhoto report={report} /><PublicOccurrencePhoto report={report} /></AuthContext>)
  expect(request).not.toHaveBeenCalled(); expect(container.querySelector('img,video')).toBeNull()
  expect(screen.getAllByText(/Vídeo · 1.0 s/)).toHaveLength(2)
})
it('private player only requests on click, creates Blob after complete read, revokes on account change', async () => {
  request.mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'video/mp4' } }))
  const view = render(<StrictMode><AuthContext value={auth()}><OccurrenceGallery report={report} /></AuthContext></StrictMode>)
  expect(request).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Carregar vídeo' }))
  await waitFor(() => expect(view.container.querySelector('video')).toHaveAttribute('src', 'blob:synthetic'))
  expect(request.mock.calls[0][0]).toBe(`/api/occurrences/${report.id}/media/${report.media![0].id}`)
  expect(request.mock.calls[0][2]).toBeInstanceOf(AbortSignal)
  const player = view.container.querySelector('video')!
  expect(player).toHaveAttribute('preload', 'none'); expect(player).toHaveAttribute('playsinline'); expect(player).not.toHaveAttribute('autoplay')
  view.rerender(<StrictMode><AuthContext value={auth('next')}><OccurrenceGallery report={report} /></AuthContext></StrictMode>)
  expect(view.container.querySelector('video')).toBeNull(); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:synthetic')
})
it('public player sets application endpoint only after action and never private fetch', () => {
  vi.stubEnv('VITE_API_URL', 'https://api.example.com')
  const view = render(<AuthContext value={auth()}><OccurrenceVideo report={report} publicView /></AuthContext>)
  expect(view.container.querySelector('video')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Carregar vídeo' }))
  expect(view.container.querySelector('video')).toHaveAttribute('src', `https://api.example.com/api/public/occurrences/${report.id}/media/${report.media![0].id}`)
  expect(request).not.toHaveBeenCalled()
})
it('unmount aborts and discards a late download', async () => {
  let resolve!: (response: Response) => void
  request.mockReturnValue(new Promise(r => { resolve = r }))
  const view = render(<AuthContext value={auth()}><OccurrenceVideo report={report} /></AuthContext>)
  fireEvent.click(screen.getByRole('button', { name: 'Carregar vídeo' }))
  const signal = request.mock.calls[0][2]!
  view.unmount(); expect(signal.aborted).toBe(true)
  await act(async () => { resolve(new Response(new Uint8Array([1]), { headers: { 'Content-Type': 'video/mp4' } })) })
  expect(URL.createObjectURL).not.toHaveBeenCalled()
})

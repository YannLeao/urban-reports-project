import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { useState } from 'react'
import { AuthProvider } from '../auth/AuthProvider'
import { useAuth, STORAGE_KEY } from '../auth/auth'
import { MAX_REPORT_PDF_BYTES, readReportPdf, useReportPdf } from './report-pdf'

function Harness() {
  const auth = useAuth()
  const pdf = useReportPdf()
  const [message, setMessage] = useState('')
  return <>
    <p>{auth.state.status}</p>
    <button onClick={() => { void pdf.download() }}>Baixar</button>
    <button onClick={() => { void auth.logout() }}>Sair</button>
    <button onClick={() => { void auth.login('new@example.com', 'synthetic password').then(() => setMessage('nova conta')) }}>Trocar</button>
    <p>{message}</p>
  </>
}

test.each(['logout', 'account', 'same-account'])('session change %s during body read cancels the download', async mode => {
  const user = { id: 'a50062d3-9ac2-4e70-86fa-eac5249f4d0c', name: 'Pessoa administradora', email: 'admin@example.com', role: 'ADMIN' }
  const next = { ...user, id: mode === 'same-account' ? user.id : 'b50062d3-9ac2-4e70-86fa-eac5249f4d0c' }
  const expiresAt = new Date(Date.now() + 1800000).toISOString()
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ accessToken: 'synthetic', expiresAt }))
  vi.stubEnv('VITE_API_URL', 'https://api.example.com')
  const cancel = vi.fn(); const create = vi.fn()
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: create })
  let current = user
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementation(async (url) => {
    if (String(url).endsWith('/auth/me')) return Response.json(current)
    if (String(url).endsWith('/auth/logout')) return new Response(null, { status: 204 })
    if (String(url).endsWith('/auth/login')) {
      current = next
      return Response.json({ accessToken: 'new-synthetic', tokenType: 'Bearer', expiresAt, user: next })
    }
    return new Response(new ReadableStream({ cancel }), { headers: { 'Content-Type': 'application/pdf' } })
  }))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><AuthProvider><Harness /></AuthProvider></QueryClientProvider>)
  await screen.findByText('authenticated')
  await userEvent.click(screen.getByRole('button', { name: 'Baixar' }))
  await userEvent.click(screen.getByRole('button', { name: mode === 'logout' ? 'Sair' : 'Trocar' }))
  await waitFor(() => expect(cancel).toHaveBeenCalledTimes(1))
  expect(create).not.toHaveBeenCalled()
  if (mode === 'logout') expect(await screen.findByText('anonymous')).toBeVisible()
  else expect(await screen.findByText('nova conta')).toBeVisible()
})

test('actual streamed byte limit rejects unknown-length oversized response and cancels reader', async () => {
  const cancel = vi.fn()
  const response = new Response(new ReadableStream({ start(controller) {
    controller.enqueue(new Uint8Array(MAX_REPORT_PDF_BYTES)); controller.enqueue(new Uint8Array(1))
  }, cancel }), { headers: { 'Content-Type': 'application/pdf' } })
  await expect(readReportPdf(response, new AbortController().signal)).rejects.toThrow('PDF excede limite')
  expect(cancel).toHaveBeenCalledTimes(1)
})

test('object URL is retained through click and released after the download-start timer', async () => {
  // The page tests cover click/unmount; real timers verify delayed cleanup without fake auth expiry timers.
  const revoke = vi.fn()
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: () => 'blob:timer' })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke })
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => expect(revoke).not.toHaveBeenCalled())
  const user = { id: 'a50062d3-9ac2-4e70-86fa-eac5249f4d0c', name: 'Admin', email: 'admin@example.com', role: 'ADMIN' }
  vi.stubEnv('VITE_API_URL', 'https://api.example.com')
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ accessToken: 'synthetic', expiresAt: new Date(Date.now() + 1800000).toISOString() }))
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementation(async url => String(url).endsWith('/auth/me') ? Response.json(user)
    : new Response('%PDF-1.7\n%%EOF\n', { headers: { 'Content-Type': 'application/pdf' } })))
  render(<QueryClientProvider client={new QueryClient()}><AuthProvider><Harness /></AuthProvider></QueryClientProvider>)
  await screen.findByText('authenticated')
  await userEvent.click(screen.getByRole('button', { name: 'Baixar' }))
  await waitFor(() => expect(click).toHaveBeenCalledTimes(1))
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 1100)) })
  expect(revoke).toHaveBeenCalledWith('blob:timer')
  expect(document.querySelector('a[download]')).toBeNull()
})

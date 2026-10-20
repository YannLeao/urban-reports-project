import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/auth'
import { PrivateRequestError } from '../../lib/api'
import { reportKey } from './occurrence-report'

export const MAX_REPORT_PDF_BYTES = 16 * 1024 * 1024
// Stream to EOF with a hard byte bound; never save truncated JSON/HTML as a PDF.
export async function readReportPdf(response: Response, signal: AbortSignal): Promise<Blob> {
  if (response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/pdf'
    || Number(response.headers.get('Content-Length')) > MAX_REPORT_PDF_BYTES || !response.body) {
    await response.body?.cancel().catch(() => {})
    throw new Error('PDF inválido')
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array<ArrayBuffer>[] = []
  let size = 0
  const abort = () => { void reader.cancel().catch(() => {}) }
  signal.addEventListener('abort', abort, { once: true })
  try {
    if (signal.aborted) throw new DOMException('Cancelado', 'AbortError')
    for (;;) {
      const { done, value } = await reader.read()
      if (signal.aborted) throw new DOMException('Cancelado', 'AbortError')
      if (done) break
      size += value.byteLength
      if (size > MAX_REPORT_PDF_BYTES) throw new Error('PDF excede limite')
      chunks.push(new Uint8Array(value))
    }
    const blob = new Blob(chunks, { type: 'application/pdf' })
    const start = await blob.slice(0, 8).text()
    const end = await blob.slice(-1024).text()
    if (!/^%PDF-[12]\.[0-9]/.test(start) || !/%%EOF\s*$/.test(end)) throw new Error('PDF inválido')
    return blob
  } finally {
    signal.removeEventListener('abort', abort)
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

export function useReportPdf() {
  const { state, request, sessionSignal } = useAuth()
  const client = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const [denied, setDenied] = useState(false)
  const pending = useRef<AbortController | null>(null)
  const resources = useRef<{ url: string, timer: number, link: HTMLAnchorElement } | null>(null)
  const userId = state.status === 'authenticated' ? state.user.id : null
  useEffect(() => {
    setBusy(false); setError(false); setDenied(false)
    return () => {
      pending.current?.abort(); pending.current = null
      const download = resources.current
      if (download) { clearTimeout(download.timer); URL.revokeObjectURL(download.url); download.link.remove(); resources.current = null }
    }
  }, [userId, state.status, sessionSignal])

  async function download() {
    if (pending.current || denied || state.status !== 'authenticated' || state.user.role !== 'ADMIN') return
    const controller = new AbortController()
    pending.current = controller
    const cancelSession = () => controller.abort()
    sessionSignal.addEventListener('abort', cancelSession, { once: true })
    if (sessionSignal.aborted) cancelSession()
    setBusy(true); setError(false)
    try {
      const response = await request('/api/admin/reports/occurrences/pdf', 'GET', controller.signal)
      const blob = await readReportPdf(response, controller.signal)
      if (controller.signal.aborted || pending.current !== controller) return
      const previous = resources.current
      if (previous) { clearTimeout(previous.timer); URL.revokeObjectURL(previous.url); previous.link.remove() }
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `alo-cidade-relatorio-${new Date().toISOString().replace(/[-:]/g, '').replace(/T/, '-').replace(/\.\d{3}Z$/, 'Z')}.pdf`
      document.body.append(link)
      const timer = window.setTimeout(() => { URL.revokeObjectURL(url); link.remove(); if (resources.current?.url === url) resources.current = null }, 1000)
      resources.current = { url, link, timer }
      link.click()
    } catch (failure) {
      if (!controller.signal.aborted && pending.current === controller) {
        if (failure instanceof PrivateRequestError && failure.status === 403) {
          setDenied(true)
          await client.cancelQueries({ queryKey: reportKey(userId) })
          client.removeQueries({ queryKey: reportKey(userId) })
        } else if (!(failure instanceof PrivateRequestError && failure.status === 401)) setError(true)
      }
    } finally {
      sessionSignal.removeEventListener('abort', cancelSession)
      if (pending.current === controller) { pending.current = null; setBusy(false) }
    }
  }
  return { busy, error, denied, download }
}

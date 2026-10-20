import { describe, expect, it, vi } from 'vitest'
import { MAX_VIDEO_BYTES, readVideo } from './video-download'

describe('bounded private video read', () => {
  it('accepts exact bytes only after EOF and never calls response.blob', async () => {
    const response = new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'video/mp4', 'Content-Length': '3' } })
    const blob = vi.spyOn(response, 'blob')
    const result = await readVideo(response, new AbortController().signal)
    expect(result.size).toBe(3); expect(result.type).toBe('video/mp4'); expect(blob).not.toHaveBeenCalled()
  })
  it('cancels excess bytes during chunked transfer', async () => {
    const cancel = vi.fn()
    let remaining = MAX_VIDEO_BYTES + 1
    const body = new ReadableStream({
      pull(controller) { const size = Math.min(65536, remaining); remaining -= size; if (size) controller.enqueue(new Uint8Array(size)); else controller.close() }, cancel,
    })
    await expect(readVideo(new Response(body, { headers: { 'Content-Type': 'video/mp4' } }), new AbortController().signal)).rejects.toThrow('25 MiB')
    expect(cancel).toHaveBeenCalled()
  })
  it.each<Record<string, string>>([
    { 'Content-Type': 'text/html' },
    { 'Content-Type': 'video/mp4', 'Content-Length': `${MAX_VIDEO_BYTES + 1}` },
    { 'Content-Type': 'video/mp4', 'Content-Length': 'NaN' },
    { 'Content-Type': 'video/mp4', 'Content-Length': '0' },
  ])('refuses invalid metadata before reading', async headers => {
    await expect(readVideo(new Response(new Uint8Array([1]), { headers }), new AbortController().signal)).rejects.toThrow()
  })
  it('refuses truncation and aborted responses', async () => {
    const response = () => new Response(new Uint8Array([1]), { headers: { 'Content-Type': 'video/mp4', 'Content-Length': '2' } })
    await expect(readVideo(response(), new AbortController().signal)).rejects.toThrow('incompleto')
    const controller = new AbortController(); controller.abort()
    await expect(readVideo(response(), controller.signal)).rejects.toThrow()
  })
})

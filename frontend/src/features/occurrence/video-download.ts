export const MAX_VIDEO_BYTES = 26214400

// Bound while reading, including chunked responses and lying Content-Length.
export async function readVideo(response: Response, signal: AbortSignal): Promise<Blob> {
  const length = response.headers.get('Content-Length')
  const type = response.headers.get('Content-Type')?.split(';')[0].trim()
  if (response.status !== 200 || type !== 'video/mp4' || length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_VIDEO_BYTES || Number(length) < 1)) {
    await response.body?.cancel(); throw new Error('Resposta de vídeo inválida.')
  }
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Vídeo indisponível.')
  const chunks: Uint8Array<ArrayBuffer>[] = []
  let size = 0
  const abort = () => { void reader.cancel() }
  signal.addEventListener('abort', abort, { once: true })
  try {
    for (;;) {
      if (signal.aborted) throw new DOMException('Cancelado', 'AbortError')
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_VIDEO_BYTES) throw new Error('O vídeo excedeu 25 MiB.')
      chunks.push(new Uint8Array(value))
    }
    if (signal.aborted || size === 0 || length !== null && size !== Number(length)) throw new Error('Vídeo incompleto.')
    return new Blob(chunks, { type: 'video/mp4' })
  } finally {
    signal.removeEventListener('abort', abort)
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

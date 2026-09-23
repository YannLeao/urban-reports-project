export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export const IMAGE_ACCEPT = IMAGE_TYPES.join(',')

export function validateImageFile(file: File): string | null {
  if (file.size === 0) return 'O arquivo está vazio. Escolha outra imagem.'
  if (!IMAGE_TYPES.some(type => type === file.type)) {
    return 'Formato não reconhecido ou incompatível. Escolha JPEG, PNG ou WebP. HEIC/HEIF não é aceito neste teste.'
  }
  if (file.size > MAX_IMAGE_BYTES) return 'A imagem ultrapassa 5 MiB. Escolha uma imagem menor.'
  return null
}

// Owns only the temporary validation URL; the displayed preview has its own URL.
export async function checkImageDecoding(file: File, signal: AbortSignal): Promise<void> {
  const url = URL.createObjectURL(file)
  try {
    await new Promise<void>((resolve, reject) => {
      const image = new Image()
      const finish = (error?: Error) => {
        image.onload = null
        image.onerror = null
        signal.removeEventListener('abort', abort)
        image.src = ''
        if (error) reject(error)
        else resolve()
      }
      const abort = () => finish(new DOMException('Aborted', 'AbortError'))
      image.onload = () => finish(image.naturalWidth && image.naturalHeight ? undefined : new Error('Invalid image'))
      image.onerror = () => finish(new Error('Invalid image'))
      signal.addEventListener('abort', abort, { once: true })
      if (signal.aborted) abort()
      else image.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

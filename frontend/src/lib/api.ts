import { z } from 'zod'

const apiUrlSchema = z.url().pipe(z.string().refine((value) => {
  const url = new URL(value)
  return ['http:', 'https:'].includes(url.protocol)
    && !url.username && !url.password && !url.search && !url.hash
}))

export function getApiUrl(value = import.meta.env.VITE_API_URL, protocol = window.location.protocol) {
  if (!value?.trim()) throw new Error('VITE_API_URL não foi configurada.')

  const result = apiUrlSchema.safeParse(value.trim())
  if (!result.success) throw new Error('VITE_API_URL deve ser uma URL HTTP ou HTTPS válida, sem credenciais, consulta ou fragmento.')
  if (protocol === 'https:' && new URL(result.data).protocol === 'http:') {
    throw new Error('A API de produção deve usar HTTPS.')
  }
  return result.data.replace(/\/+$/, '')
}

export async function getJson(path: string, signal?: AbortSignal): Promise<unknown> {
  const url = `${getApiUrl()}/${path.replace(/^\/+/, '')}`
  let response: Response
  try {
    response = await fetch(url, { signal })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new Error('Não foi possível conectar à API. Verifique se o backend está disponível.')
  }
  if (!response.ok) throw new Error(`A API respondeu com o status HTTP ${response.status}.`)
  try {
    return await response.json()
  } catch {
    throw new Error('A API retornou uma resposta inválida.')
  }
}

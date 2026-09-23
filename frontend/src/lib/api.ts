import { z } from 'zod'

const apiUrlSchema = z.url().pipe(z.string().refine((value) => {
  const url = new URL(value)
  return ['http:', 'https:'].includes(url.protocol)
    && !url.username && !url.password && !url.search && !url.hash
}))

export function getApiUrl(value = import.meta.env.VITE_API_URL, protocol = window.location.protocol) {
  if (!value?.trim()) throw new Error('A conexão do site ainda não foi configurada. Tente novamente mais tarde.')

  const result = apiUrlSchema.safeParse(value.trim())
  if (!result.success) throw new Error('A configuração de conexão do site precisa ser corrigida. Tente novamente mais tarde.')
  if (protocol === 'https:' && new URL(result.data).protocol === 'http:') {
    throw new Error('A configuração de conexão do site precisa ser corrigida. Tente novamente mais tarde.')
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
    throw new Error('Não conseguimos conectar ao serviço. Confira sua conexão e tente novamente.')
  }
  if (!response.ok) throw new Error('O serviço não concluiu a verificação. Tente novamente em instantes.')
  try {
    return await response.json()
  } catch {
    throw new Error('O serviço enviou uma resposta que não conseguimos reconhecer.')
  }
}

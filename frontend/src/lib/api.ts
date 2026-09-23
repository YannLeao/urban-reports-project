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

const apiErrorSchema = z.object({
  code: z.string(),
  fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
})

export class ApiRequestError extends Error {
  readonly code: string
  readonly fieldErrors?: Record<string, string[]>
  constructor(code: string, fieldErrors?: Record<string, string[]>) {
    super('A solicitação não pôde ser confirmada.')
    this.code = code
    this.fieldErrors = fieldErrors
  }
}

export async function postJson(path: string, body: unknown, expectedStatus = 201): Promise<unknown> {
  const url = `${getApiUrl()}/${path.replace(/^\/+/, '')}`
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST', credentials: 'omit',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
  } catch {
    throw new ApiRequestError('UNCERTAIN_RESULT')
  }
  let payload: unknown
  try { payload = await response.json() } catch { throw new ApiRequestError('UNCERTAIN_RESULT') }
  if (!response.ok) {
    const error = apiErrorSchema.safeParse(payload)
    if (error.success) throw new ApiRequestError(error.data.code, error.data.fieldErrors)
    throw new ApiRequestError('UNCERTAIN_RESULT')
  }
  if (response.status !== expectedStatus) throw new ApiRequestError('UNCERTAIN_RESULT')
  return payload
}

export class PrivateRequestError extends Error {
  readonly status: number
  constructor(status: number) { super('Não foi possível concluir a solicitação.'); this.status = status }
}

// Relative API paths only. Redirects must never forward a credential to another endpoint.
export async function privateRequest(path: string, token: string, signal: AbortSignal, method = 'GET') {
  if (!/^\/api\/[a-zA-Z0-9/_-]+$/.test(path)) throw new Error('Caminho privado inválido.')
  const response = await fetch(`${getApiUrl()}${path}`, {
    method, signal, credentials: 'omit', redirect: 'error',
    headers: { Authorization: `Bearer ${token}`, ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
    ...(method === 'POST' ? { body: '{}' } : {}),
  })
  if (!response.ok) throw new PrivateRequestError(response.status)
  return response
}

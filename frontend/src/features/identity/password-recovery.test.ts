import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { recoveryRequestSchema, requestPasswordRecovery, resetPassword, resetSchema } from './password-recovery'

const fetchMock = vi.fn<typeof fetch>()
beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('VITE_API_URL', 'https://api.example.com')
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

test('a solicitação envia só o e-mail, sem credenciais, e aceita 202', async () => {
  fetchMock.mockResolvedValueOnce(Response.json({ requested: true }, { status: 202 }))
  await requestPasswordRecovery('ana@example.com')
  const [url, options] = fetchMock.mock.calls[0]
  expect(url).toBe('https://api.example.com/api/auth/password-recovery-requests')
  expect(options).toMatchObject({ method: 'POST', credentials: 'omit' })
  expect(JSON.parse(String(options?.body))).toEqual({ email: 'ana@example.com' })
})

test('um status diferente do esperado nunca é tratado como sucesso', async () => {
  fetchMock.mockResolvedValueOnce(Response.json({ requested: true }, { status: 200 }))
  await expect(requestPasswordRecovery('ana@example.com')).rejects.toMatchObject({ code: 'UNCERTAIN_RESULT' })
})

test('a redefinição envia token e senha e aceita 200', async () => {
  fetchMock.mockResolvedValueOnce(Response.json({ reset: true }))
  await resetPassword('a'.repeat(43), 'synthetic valid password phrase')
  const [url, options] = fetchMock.mock.calls[0]
  expect(url).toBe('https://api.example.com/api/auth/password-resets')
  expect(JSON.parse(String(options?.body))).toEqual({ token: 'a'.repeat(43), password: 'synthetic valid password phrase' })
})

test('link inválido vira erro com código, sem expor detalhes do servidor', async () => {
  fetchMock.mockResolvedValueOnce(Response.json({ code: 'INVALID_RECOVERY_LINK', message: 'private details' }, { status: 400 }))
  await expect(resetPassword('a'.repeat(43), 'synthetic valid password phrase')).rejects.toMatchObject({ code: 'INVALID_RECOVERY_LINK' })
})

test('os esquemas normalizam o e-mail e exigem senha forte e confirmação igual', () => {
  expect(recoveryRequestSchema.parse({ email: ' ANA@Example.com ' }).email).toBe('ana@example.com')
  expect(recoveryRequestSchema.safeParse({ email: 'invalido' }).success).toBe(false)
  expect(resetSchema.safeParse({ password: 'curta', confirmPassword: 'curta' }).success).toBe(false)
  expect(resetSchema.safeParse({ password: 'synthetic valid password phrase', confirmPassword: 'outra senha qualquer' }).success).toBe(false)
  expect(resetSchema.safeParse({ password: 'synthetic valid password phrase', confirmPassword: 'synthetic valid password phrase' }).success).toBe(true)
})
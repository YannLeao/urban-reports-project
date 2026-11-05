import { z } from 'zod'
import { ApiRequestError, postJson } from '../../lib/api'
import { registrationSchema } from './registration'

// Mesmo formato do token que o backend gera: 32 bytes em Base64 URL, sem preenchimento.
export const recoveryTokenPattern = /^[A-Za-z0-9_-]{43}$/

export const recoveryRequestSchema = z.object({ email: registrationSchema.shape.email })

export const resetSchema = z.object({ password: registrationSchema.shape.password, confirmPassword: z.string() })
  .refine((value) => value.password === value.confirmPassword, {
    path: ['confirmPassword'], message: 'As senhas precisam ser iguais.',
  })

// A resposta é sempre a mesma, exista ou não a conta: a tela nunca deve diferenciar os casos.
export async function requestPasswordRecovery(email: string) {
  const payload = await postJson('/api/auth/password-recovery-requests', { email }, 202)
  if (!z.object({ requested: z.literal(true) }).safeParse(payload).success) throw new ApiRequestError('UNCERTAIN_RESULT')
}

export async function resetPassword(token: string, password: string) {
  const payload = await postJson('/api/auth/password-resets', { token, password }, 200)
  if (!z.object({ reset: z.literal(true) }).safeParse(payload).success) throw new ApiRequestError('UNCERTAIN_RESULT')
}
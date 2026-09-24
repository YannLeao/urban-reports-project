import { createContext, useContext } from 'react'
import { z } from 'zod'

export const userSchema = z.object({ id: z.uuid(), name: z.string(), email: z.string(), role: z.literal('USER') })
export const credentialSchema = z.object({ accessToken: z.string().min(1), expiresAt: z.iso.datetime() })
export const loginSchema = credentialSchema.extend({ tokenType: z.literal('Bearer'), user: userSchema })
export type Credential = z.infer<typeof credentialSchema>
export type User = z.infer<typeof userSchema>
export type AuthState =
  | { status: 'initializing' | 'anonymous' | 'unavailable'; message?: string }
  | { status: 'authenticated'; user: User }
export interface AuthContextValue {
  state: AuthState
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  retry: () => void
  request: (path: string, method?: string, signal?: AbortSignal, body?: BodyInit) => Promise<Response>
}
export const AuthContext = createContext<AuthContextValue | null>(null)
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('AuthProvider obrigatório')
  return context
}
export const STORAGE_KEY = 'alo-cidade.auth.v1'

export function safeReturnPath(value: unknown): string {
  // A route pathname, without escapes, query credentials, backslashes or URL authority.
  return typeof value === 'string' && /^\/(?:[a-zA-Z0-9_-]+\/?)*$/.test(value)
    && !['/entrar', '/cadastro'].includes(value) ? value : '/minha-conta'
}

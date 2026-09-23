import { z } from 'zod'
import { ApiRequestError, postJson } from '../../lib/api'

// Same explicit ASCII trim set and address grammar as RegistrationValidation.
// eslint-disable-next-line no-control-regex -- Explicit shared whitespace contract includes ASCII tab/newline.
export const trimRegistration = (value: string) => value.replace(/^[\u0009-\u000d\u0020]+|[\u0009-\u000d\u0020]+$/g, '')
const emailPattern = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/
const validUnicode = (value: string) => ![...value].some((char) => {
  const point = char.codePointAt(0)!
  return point >= 0xd800 && point <= 0xdfff
})
export const registrationSchema = z.object({
  name: z.string().transform(trimRegistration).refine((value) =>
    [...value].length >= 2 && [...value].length <= 100 && validUnicode(value)
    && ![...value].some((char) => {
      const point = char.codePointAt(0)!
      return point < 32 || (point >= 127 && point <= 159) || point === 0x2028 || point === 0x2029
    }), 'Use um nome de 2 a 100 caracteres, sem caracteres de controle.'),
  email: z.string().transform(trimRegistration).refine((value) =>
    [...value].every((char) => char.codePointAt(0)! <= 127)
    && value.length <= 254 && value.indexOf('@') <= 64 && emailPattern.test(value.toLowerCase()),
  'Informe um e-mail válido com caracteres ASCII.').transform((value) => value.toLowerCase()),
  password: z.string().refine((value) => [...value].length >= 15 && [...value].length <= 128 && validUnicode(value),
    'Use uma senha de 15 a 128 caracteres. Espaços e acentos são permitidos.'),
  confirmPassword: z.string(),
}).refine((value) => value.password === value.confirmPassword, {
  path: ['confirmPassword'], message: 'As senhas precisam ser iguais.',
})

const responseSchema = z.object({ id: z.uuid(), name: z.string(), email: z.string(), role: z.literal('USER') })
export async function registerCitizen(input: z.infer<typeof registrationSchema>) {
  const payload = await postJson('/api/auth/register', {
    name: input.name, email: input.email, password: input.password,
  })
  const result = responseSchema.safeParse(payload)
  if (!result.success) throw new ApiRequestError('UNCERTAIN_RESULT')
  return result.data
}

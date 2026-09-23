import { expect, test } from 'vitest'
import { registrationSchema } from './registration'

const valid = { name: "Ána D'Ávila", email: 'pessoa@example.com', password: 'a'.repeat(15), confirmPassword: 'a'.repeat(15) }

test.each(['pessoa@example.com', ' USER+tag@EXAMPLE.COM ', 'a.b@example.co.uk', "o'hara@example.com"])('accepts shared email case %s', (email) => {
  expect(registrationSchema.safeParse({ ...valid, email }).success).toBe(true)
})
test.each(['a..b@example.com', '.a@example.com', 'a@localhost', 'á@example.com', 'a@-example.com', 'a@exa_mple.com', 'a@ｅxample.com', `${'a'.repeat(65)}@example.com`])('rejects shared email case %s', (email) => {
  expect(registrationSchema.safeParse({ ...valid, email }).success).toBe(false)
})
test.each([' ', 'a', 'a'.repeat(101), 'Ana\nSilva', 'Ana\u007f', 'Ana\u2028Silva'])('rejects invalid name %s', (name) => {
  expect(registrationSchema.safeParse({ ...valid, name }).success).toBe(false)
})
test.each(['Áa', '𐐀'.repeat(100)])('accepts name code point boundaries', (name) => {
  expect(registrationSchema.safeParse({ ...valid, name }).success).toBe(true)
})
test.each([14, 15, 128, 129])('counts password code points at %i', (length) => {
  const password = '🔐'.repeat(length)
  expect(registrationSchema.safeParse({ ...valid, password, confirmPassword: password }).success).toBe(length >= 15 && length <= 128)
})
test('preserves password exactly, canonicalizes email and trims only outer name whitespace', () => {
  const password = '  á long pass phrase  '
  const result = registrationSchema.parse({ ...valid, name: "  Ána  D'Ávila-Sá  ", email: ' USER+tag@EXAMPLE.COM ', password, confirmPassword: password })
  expect(result).toEqual({ name: "Ána  D'Ávila-Sá", email: 'user+tag@example.com', password, confirmPassword: password })
})
test('requires matching confirmation', () => {
  expect(registrationSchema.safeParse({ ...valid, confirmPassword: 'different' }).success).toBe(false)
})

test('accepts 254 email characters and rejects 255', () => {
  const email = `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(61)}`
  expect(email).toHaveLength(254)
  expect(registrationSchema.safeParse({ ...valid, email }).success).toBe(true)
  expect(registrationSchema.safeParse({ ...valid, email: `${email}d` }).success).toBe(false)
})

import { describe, expect, it } from 'vitest'
import { moderationActions, transitionSchema } from './moderation'
import { occurrenceStatusLabel, occurrenceStatusSchema } from './occurrence'

describe('moderation contract', () => {
  it('provides exactly the four allowed actions and Portuguese labels', () => {
    expect(moderationActions).toEqual({ PENDING: ['ACCEPTED', 'REJECTED'], ACCEPTED: ['RESOLVED'], RESOLVED: [], REJECTED: [] })
    expect(occurrenceStatusSchema.options.map(occurrenceStatusLabel)).toEqual(['Pendente', 'Aceita', 'Resolvida', 'Rejeitada'])
    expect(occurrenceStatusSchema.safeParse('IN_PROGRESS').success).toBe(false)
  })

  it.each([10, 500])('accepts %i Unicode code points with shared ASCII trim', length => {
    const reason = '😀'.repeat(length)
    expect(transitionSchema.parse({ target: 'REJECTED', reason: `\t ${reason}\r\n` }).reason).toBe(reason)
  })

  it.each([undefined, null, '', ' \t\r\n', 'a'.repeat(9), 'a'.repeat(501), '😀'.repeat(9), '😀'.repeat(501), 'a'.repeat(10) + '\uD800', 'a'.repeat(10) + '\0'])('rejects invalid reason %#', reason => {
    expect(transitionSchema.safeParse({ target: 'REJECTED', reason }).success).toBe(false)
  })

  it('requires a comment on acceptance and rejection', () => {
    for (const target of ['ACCEPTED', 'REJECTED']) {
      for (const reason of [undefined, null, '', ' ', 'curto']) expect(transitionSchema.safeParse({ target, reason }).success).toBe(false)
      expect(transitionSchema.safeParse({ target, reason: 'Comentário válido' }).success).toBe(true)
    }
    expect(transitionSchema.safeParse({ target: 'RESOLVED', reason: null }).success).toBe(true)
    expect(transitionSchema.safeParse({ target: 'RESOLVED', reason: 'indevido' }).success).toBe(false)
  })
})

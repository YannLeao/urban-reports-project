import { describe, expect, it } from 'vitest'
import { moderationActions, transitionSchema } from './moderation'
import { occurrenceStatusLabel, occurrenceStatusSchema } from './occurrence'

describe('moderation contract', () => {
  it('provides exactly the four allowed actions and Portuguese labels', () => {
    expect(moderationActions).toEqual({ PENDING: ['IN_ANALYSIS', 'REJECTED'], IN_ANALYSIS: ['RESOLVED', 'REJECTED'], RESOLVED: [], REJECTED: [] })
    expect(occurrenceStatusSchema.options.map(occurrenceStatusLabel)).toEqual(['Pendente', 'Em análise', 'Resolvida', 'Rejeitada'])
    expect(occurrenceStatusSchema.safeParse('IN_PROGRESS').success).toBe(false)
  })

  it.each([10, 500])('accepts %i Unicode code points with shared ASCII trim', length => {
    const reason = '😀'.repeat(length)
    expect(transitionSchema.parse({ target: 'REJECTED', reason: `\t ${reason}\r\n` }).reason).toBe(reason)
  })

  it.each([undefined, null, '', ' \t\r\n', 'a'.repeat(9), 'a'.repeat(501), '😀'.repeat(9), '😀'.repeat(501), 'a'.repeat(10) + '\uD800', 'a'.repeat(10) + '\0'])('rejects invalid reason %#', reason => {
    expect(transitionSchema.safeParse({ target: 'REJECTED', reason }).success).toBe(false)
  })

  it('rejects any non-null reason on other actions', () => {
    for (const target of ['IN_ANALYSIS', 'RESOLVED']) {
      for (const reason of [undefined, null]) expect(transitionSchema.safeParse({ target, reason }).success).toBe(true)
      for (const reason of ['', ' ', 'Justificativa indevida']) expect(transitionSchema.safeParse({ target, reason }).success).toBe(false)
    }
  })
})

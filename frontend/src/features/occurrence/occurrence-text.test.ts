import { describe, expect, it } from 'vitest'
import { cleanOccurrenceText, validOccurrenceText } from './occurrence-text'

describe('occurrence text contract', () => {
  it.each([[5, 100], [20, 1000], [2, 100], [5, 200]])('counts Unicode code points between %i and %i', (min, max) => {
    expect(validOccurrenceText('😀'.repeat(min - 1), min, max)).toBe(false)
    expect(validOccurrenceText(` \t${'😀'.repeat(min)}\r\n `, min, max)).toBe(true)
    expect(validOccurrenceText('😀'.repeat(max), min, max)).toBe(true)
    expect(validOccurrenceText('😀'.repeat(max + 1), min, max)).toBe(false)
  })
  it('preserves internal whitespace and uses the same external trim as Java', () => {
    expect(cleanOccurrenceText(' \tBuraco  na rua\r\n')).toBe('Buraco  na rua')
    expect(cleanOccurrenceText('\u00a0Bairro\u00a0')).toBe('\u00a0Bairro\u00a0')
    expect(validOccurrenceText('ab\0cde', 5, 100)).toBe(false)
    expect(validOccurrenceText('abcd\ud800', 5, 100)).toBe(false)
  })
})

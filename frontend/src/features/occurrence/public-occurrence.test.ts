import { describe, expect, it } from 'vitest'
import { publicOccurrencePageSchema } from './public-occurrence'

const item = {
  id: '3f0c2f64-6f0e-4c53-9a39-7a0b1f2b8e11',
  categoryId: 1,
  categoryName: 'Iluminação pública',
  title: 'Poste apagado na rua',
  description: null,
  neighborhood: 'Centro',
  reference: 'Perto da praça',
  status: 'PENDING',
  createdAt: '2026-09-28T12:00:00Z',
}
const page = { items: [item], page: 0, size: 20, totalItems: 1, totalPages: 1 }

describe('publicOccurrencePageSchema', () => {
  it('accepts a page and an occurrence without description', () => {
    const parsed = publicOccurrencePageSchema.parse(page)
    expect(parsed.items[0].description).toBeNull()
    expect(parsed.totalItems).toBe(1)
  })

  it('drops private fields if the API ever sends them', () => {
    const leaked = { ...page, items: [{ ...item, authorId: 'x', version: 3, imageKey: 'occurrences/a.png', history: [{ reason: 'private' }] }] }
    const parsed = publicOccurrencePageSchema.parse(leaked)
    expect(Object.keys(parsed.items[0])).not.toEqual(expect.arrayContaining(['authorId']))
    expect(Object.keys(parsed.items[0])).not.toContain('version')
    expect(Object.keys(parsed.items[0])).not.toContain('imageKey')
    expect(Object.keys(parsed.items[0])).not.toContain('history')
  })

  it('rejects malformed pages', () => {
    expect(() => publicOccurrencePageSchema.parse({ ...page, page: -1 })).toThrow()
    expect(() => publicOccurrencePageSchema.parse({ ...page, items: [{ ...item, id: 'nope' }] })).toThrow()
  })
})

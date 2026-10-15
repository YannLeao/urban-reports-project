import { expect, test } from 'vitest'
import { groupMarkers } from './group-markers'
import type { OccurrenceMarker } from '../occurrence/markers'

function marker(index: number): OccurrenceMarker {
  return { id: String(index), title: `Relato ${index}`, categoryId: 1, categoryName: 'Categoria', status: 'PENDING', latitude: 0, longitude: 0 }
}
test('more than fifty identical points form a selectable group without losing any report', () => {
  const items = Array.from({ length: 61 }, (_, index) => marker(index))
  const groups = groupMarkers(items, () => ({ x: 0, y: 0 }))
  expect(groups).toHaveLength(1)
  expect(groups[0].items).toEqual(items)
})
test('nearby points across cell boundaries group, distant points remain separate, and zoom can split groups', () => {
  const items = [marker(0), marker(1), marker(2)]
  const groups = groupMarkers(items, item => ({ x: [63, 65, 300][Number(item.id)], y: 0 }))
  expect(groups.map(group => group.items.length)).toEqual([2, 1])
  const zoomed = groupMarkers(items, item => ({ x: Number(item.id) * 100, y: 0 }))
  expect(zoomed).toHaveLength(3)
  expect(groups.flatMap(group => group.items).map(item => item.id)).toEqual(['0', '1', '2'])
})

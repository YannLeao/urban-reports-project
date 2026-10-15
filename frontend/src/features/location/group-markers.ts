import type { OccurrenceMarker } from '../occurrence/markers'

export type MarkerGroup = { x: number; y: number; items: OccurrenceMarker[] }
// Screen-pixel grouping at the current zoom, including points with identical coordinates.
export function groupMarkers(items: OccurrenceMarker[], project: (item: OccurrenceMarker) => { x: number; y: number }, distance = 64) {
  const cells = new Map<string, MarkerGroup[]>()
  const groups: MarkerGroup[] = []
  for (const item of items) {
    const point = project(item)
    const x = Math.floor(point.x / distance), y = Math.floor(point.y / distance)
    let found: MarkerGroup | undefined
    for (let dx = -1; dx <= 1 && !found; dx++) for (let dy = -1; dy <= 1 && !found; dy++) {
      found = cells.get(`${x + dx},${y + dy}`)?.find(group => Math.hypot(group.x - point.x, group.y - point.y) < distance)
    }
    if (found) found.items.push(item)
    else {
      const group = { ...point, items: [item] }
      groups.push(group)
      const key = `${x},${y}`
      cells.set(key, [...(cells.get(key) ?? []), group])
    }
  }
  return groups
}

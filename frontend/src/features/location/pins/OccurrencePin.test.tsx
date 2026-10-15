import { createHash } from 'node:crypto'
import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { OccurrencePin } from './OccurrencePin'
import { categoryPins } from './pin-variants'
import { pinMarkup } from './pin-icon'
import { markerSetSchema } from '../../occurrence/markers'

// Fingerprints of path/circle geometry from the original supplied SVGs.
const originalGeometry = {
  "arborizacao": "e27c0d2f7bce53dba3070c2d78619a12075d21aeb7da9a379a38cd12c0793cdb",
  "buraco": "aed1ba69467cc9d97199560e8b15c8f693a2b7017c188540a7adbc7b6270f5e0",
  "generico": "c2d6c098980f8cb5934d1f766ec120cfe70a9eac88389a79a945eb41db3fbda2",
  "iluminacao": "d8b609df3351f88f9756070b7fd37286d9c130799e87b318bd3590be7b9793ca",
  "limpeza": "0ee76b79cfab3b36323302b7a56797e0076605e93f224ee65d329a28fec3929a",
  "saneamento": "638a4c958251083bbdc53d4aa3039f273dac5ba13ff09331a656cca0914fdf99",
  "selecionado": "c2d6c098980f8cb5934d1f766ec120cfe70a9eac88389a79a945eb41db3fbda2"
}
function geometry(svg: SVGSVGElement) {
  const text = [...svg.querySelectorAll('path,circle')].map(element => `${element.tagName}:${['d', 'cx', 'cy', 'r']
    .filter(key => element.hasAttribute(key)).map(key => `${key}=${element.getAttribute(key) ?? ''}`).join(';')}`).join('\n')
  return createHash('sha256').update(text).digest('hex')
}
test('preserves all original geometries and the selected pin while mapping every known category', () => {
  for (const categoryId of [1, 2, 3, 4, 5, 6, 7, 8] as const) {
    const view = render(<OccurrencePin categoryId={categoryId} label="Pino" />)
    const svg = view.container.querySelector('svg')!
    expect(svg).toHaveAttribute('viewBox', '0 0 64 76')
    expect(geometry(svg)).toBe(originalGeometry[categoryPins[categoryId]])
    view.unmount()
  }
  const view = render(<OccurrencePin categoryId={8} selected label="Selecionado" />)
  expect(geometry(view.container.querySelector('svg')!)).toBe(originalGeometry.selecionado)
  expect(view.container.querySelector('path')).toHaveAttribute('stroke-width', '4')
})
test('labels have unique IDs and decorative SVGs are hidden inside labeled markers', () => {
  const view = render(<><OccurrencePin categoryId={1} label="Iluminação" /><OccurrencePin categoryId={1} label="Outra iluminação" /><OccurrencePin categoryId={2} /></>)
  const labeled = screen.getAllByRole('img')
  expect(labeled[0].getAttribute('aria-labelledby')).not.toBe(labeled[1].getAttribute('aria-labelledby'))
  expect(view.container.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(1)
})
test('selection retains category geometry and changes the outline beyond its color', () => {
  const view = render(<OccurrencePin categoryId={1} selected />)
  expect(geometry(view.container.querySelector('svg')!)).toBe(originalGeometry.iluminacao)
  expect(view.container.querySelector('path')).toHaveAttribute('stroke-width', '4')
})
test('adapter renders only canonical decorative artwork and counts, never report text or HTML', () => {
  const item = { id: 'a50062d3-9ac2-4e70-86fa-eac5249f4d0c', categoryId: 1 as const, categoryName: '<script>',
    title: '<img onerror=alert(1)>', status: 'PENDING' as const, latitude: 0, longitude: 0 }
  const markup = pinMarkup([item, { ...item, id: 'b50062d3-9ac2-4e70-86fa-eac5249f4d0c' }], item.id)
  expect(markup).toContain('viewBox="0 0 64 76"')
  expect(markup).toContain('aria-hidden="true"')
  expect(markup).not.toContain('onerror')
  expect(markup).not.toContain('<script>')
  expect(markerSetSchema.safeParse({ items: [{ ...item, categoryId: 99 }], total: 1, located: 1, unlocated: 0 }).success).toBe(false)
})

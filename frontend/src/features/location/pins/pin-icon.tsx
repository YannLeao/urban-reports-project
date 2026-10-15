import { renderToStaticMarkup } from 'react-dom/server'
import { OccurrencePin } from './OccurrencePin'
import type { OccurrenceMarker } from '../../occurrence/markers'

export function pinMarkup(items: OccurrenceMarker[], selected: string | null) {
  const active = items.some(item => item.id === selected)
  return renderToStaticMarkup(<div className="relative h-full w-full">
    <OccurrencePin categoryId={items.length === 1 ? items[0].categoryId : 8} selected={active} />
    {items.length > 1 && <span className="absolute left-1/2 top-3 -translate-x-1/2 rounded-control bg-surface-raised px-1 font-bold text-text-primary">{items.length}</span>}
  </div>)
}

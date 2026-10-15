import { useState } from 'react'
import { OccurrenceMap } from '../location/OccurrenceMap'
import type { Occurrence } from './occurrence'

type LocatedReport = Pick<Occurrence, 'id' | 'categoryId' | 'categoryName' | 'title' | 'status' | 'latitude' | 'longitude'>
export function OccurrenceLocation({ report }: { report: LocatedReport }) {
  const [open, setOpen] = useState(false)
  const point = report.latitude != null && report.longitude != null ? { ...report, latitude: report.latitude, longitude: report.longitude } : null
  return <section className="mt-6" aria-label="Localização no mapa">
    {point ? <details onToggle={event => setOpen(event.currentTarget.open)}>
      <summary className="min-h-target cursor-pointer py-3 font-bold underline">Ver local no mapa</summary>
      {open && <OccurrenceMap items={[point]} selected={report.id} />}
      <p className="mt-3 text-small text-text-secondary">Latitude {point.latitude.toFixed(6)}, longitude {point.longitude.toFixed(6)} (graus decimais).</p>
    </details> : <p>Localização no mapa não informada.</p>}
  </section>
}

import { OccurrenceMap } from '../location/OccurrenceMap'
import type { Occurrence } from './occurrence'

type LocatedReport = Pick<Occurrence, 'id' | 'categoryId' | 'categoryName' | 'title' | 'status' | 'latitude' | 'longitude'>
export function OccurrenceLocation({ report }: { report: LocatedReport }) {
  const point = report.latitude != null && report.longitude != null ? { ...report, latitude: report.latitude, longitude: report.longitude } : null
  return <section className="mt-6" aria-label="Localização no mapa">
    <h2 className="text-xl">Local da ocorrência</h2>
    {point ? <>
      <p>Latitude {point.latitude.toFixed(6)}, longitude {point.longitude.toFixed(6)}.</p>
      <OccurrenceMap items={[point]} selected={report.id} />
    </> : <p>Localização no mapa não informada.</p>}
  </section>
}

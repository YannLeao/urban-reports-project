import { occurrenceDate, occurrenceStatusLabel, type OccurrenceHistoryEvent } from './occurrence'

export function OccurrenceHistory({ events }: { events: OccurrenceHistoryEvent[] }) {
  return <section className="mt-8 wrap-anywhere" aria-label="Histórico do relato">
    <h2>Histórico do relato</h2>
    {events.length === 0 ? <p>Nenhuma mudança de estado registrada.</p> : <ol className="grid gap-5 pl-6">
      {events.map(event => <li key={event.id}>
        <p className="mb-1 font-bold">{occurrenceStatusLabel(event.previousStatus)} → {occurrenceStatusLabel(event.newStatus)}</p>
        <p className="mb-1 text-small text-text-secondary">{event.responsible} · <time dateTime={event.occurredAt}>{occurrenceDate(event.occurredAt)}</time></p>
        {event.reason !== null && <p className="whitespace-pre-wrap">Justificativa: {event.reason}</p>}
      </li>)}
    </ol>}
  </section>
}

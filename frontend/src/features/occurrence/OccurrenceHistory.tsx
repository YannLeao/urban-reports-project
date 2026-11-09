import { occurrenceDate, occurrenceStatusLabel, type OccurrenceHistoryEvent } from './occurrence'
import type { Occurrence } from './occurrence'
import { OccurrenceStatus } from './OccurrenceStatus'

type Event = Omit<OccurrenceHistoryEvent, 'responsible'> & { responsible: string }
export function OccurrenceHistory({ events, currentStatus, administrative = false }: { events: Event[]; currentStatus?: Occurrence['status']; administrative?: boolean }) {
  const last = events.at(-1)
  // Only mark a current event when its final state and timestamp can be trusted.
  const currentId = last && last.newStatus === currentStatus && Number.isFinite(Date.parse(last.occurredAt)) ? last.id : null
  return <section className="mt-8 min-w-0 border-t border-border-subtle pt-6 wrap-anywhere" aria-label={administrative ? 'Histórico de moderação' : 'Histórico do relato'}>
    <h2 className="mb-2">{administrative ? 'Histórico de moderação' : 'Histórico do relato'}</h2>
    <p className="mb-6 text-small text-text-secondary">O andamento registrado pela equipe, em ordem de atualização.</p>
    {events.length === 0 ? <p>Nenhuma mudança de estado registrada.</p> : <ol className="relative m-0 grid list-none gap-6 p-0 before:absolute before:inset-y-3 before:left-3 before:w-px before:bg-border-subtle">
      {events.map(event => <li key={event.id} aria-current={event.id === currentId ? 'step' : undefined} className="relative min-w-0 pl-10">
        <span aria-hidden="true" className={`absolute top-1 left-0 size-6 rounded-pill border-2 border-surface-raised ${event.id === currentId ? 'bg-brand-default' : 'bg-brand-accent'}`} />
        <div className={`min-w-0 rounded-card border p-4 ${event.id === currentId ? 'border-border-control bg-surface-soft' : 'border-border-subtle bg-surface-raised'}`}>
          <div className="mb-3 flex flex-wrap items-center gap-2"><OccurrenceStatus status={event.newStatus} />{event.id === currentId && <span className="text-small font-bold">Estado atual</span>}</div>
          <p className="mb-1 text-small text-text-secondary">{event.responsible} · {Number.isFinite(Date.parse(event.occurredAt)) ? <time dateTime={event.occurredAt}>{occurrenceDate(event.occurredAt)}</time> : 'Data não disponível'}</p>
          <p className="mb-0 text-small text-text-secondary">{occurrenceStatusLabel(event.previousStatus)} → {occurrenceStatusLabel(event.newStatus)}</p>
          {event.reason !== null && <p className="mt-4 mb-0 whitespace-pre-wrap">{administrative || event.newStatus !== 'REJECTED' ? 'Comentário' : 'Justificativa'}: {event.reason}</p>}
        </div>
      </li>)}
    </ol>}
  </section>
}

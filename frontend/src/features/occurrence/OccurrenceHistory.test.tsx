import { render, screen, within } from '@testing-library/react'
import { expect, test } from 'vitest'
import { OccurrenceHistory } from './OccurrenceHistory'
import { occurrenceHistoryEventSchema } from './occurrence'

test('shows functional identity and renders the rejection as text', () => {
  const event = occurrenceHistoryEventSchema.parse({
    id: '3e85aa3d-19e3-42a3-8861-c435ff5908af', previousStatus: 'PENDING', newStatus: 'REJECTED',
    occurredAt: '2026-10-15T12:00:00Z', reason: '<img src=x onerror=alert(1)>', responsible: 'Moderação',
    moderatorId: 'private-id', email: 'private@example.com',
  })
  const { container } = render(<OccurrenceHistory events={[event]} />)
  expect(screen.getByText('Pendente → Rejeitada')).toBeVisible()
  expect(screen.getByText(/Justificativa: <img/)).toBeVisible()
  expect(screen.getByText(/Moderação/)).toBeVisible()
  expect(container.querySelector('img')).toBeNull()
  expect(container.textContent).not.toContain('private-id')
  expect(container.textContent).not.toContain('private@example.com')
  expect(container.querySelector('time')).toHaveAttribute('datetime', '2026-10-15T12:00:00Z')
})

test('old reports do not acquire fabricated events', () => {
  render(<OccurrenceHistory events={[]} />)
  expect(screen.getByText('Nenhuma mudança de estado registrada.')).toBeVisible()
  expect(screen.queryByRole('list')).not.toBeInTheDocument()
})

test('keeps real legacy event order and absent comments, highlighting only a matching last state', () => {
  const first = { id: 'first', previousStatus: 'PENDING', newStatus: 'ACCEPTED', occurredAt: '2026-10-01T12:00:00Z', reason: null, responsible: 'Moderação' } as const
  const last = { ...first, id: 'last', previousStatus: 'ACCEPTED', newStatus: 'REJECTED', reason: 'Comentário longo\n\nCom outro parágrafo.' } as const
  const view = render(<OccurrenceHistory events={[first, last]} currentStatus="REJECTED" />)
  const events = screen.getAllByRole('listitem')
  expect(within(events[0]).getByText('Pendente → Aceita')).toBeVisible()
  expect(within(events[0]).queryByText(/Justificativa|Comentário:/)).not.toBeInTheDocument()
  expect(within(events[1]).getByText('Aceita → Rejeitada')).toBeVisible()
  expect(events[0]).not.toHaveAttribute('aria-current')
  expect(events[1]).toHaveAttribute('aria-current', 'step')
  expect(screen.getByText(/Justificativa: Comentário longo/)).toHaveClass('whitespace-pre-wrap')
  view.rerender(<OccurrenceHistory events={[first, last]} currentStatus="RESOLVED" />)
  expect(screen.queryByText('Estado atual')).not.toBeInTheDocument()
  expect(view.container.querySelector('[aria-current]')).toBeNull()
})

test('does not manufacture a time or highlight a malformed legacy timestamp', () => {
  const { container } = render(<OccurrenceHistory currentStatus="ACCEPTED" events={[{
    id: 'legacy', previousStatus: 'PENDING', newStatus: 'ACCEPTED', occurredAt: 'unknown', reason: null, responsible: 'Moderação',
  }]} />)
  expect(screen.getByText(/Data não disponível/)).toBeVisible()
  expect(container.querySelector('time')).toBeNull()
  expect(container.querySelector('[aria-current]')).toBeNull()
})

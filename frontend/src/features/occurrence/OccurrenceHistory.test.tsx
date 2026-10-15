import { render, screen } from '@testing-library/react'
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

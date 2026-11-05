import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { SimilarOccurrencesPanel } from './SimilarOccurrencesReview'

it('does not show a retry action and still allows bypassing an unavailable lookup', () => {
  render(<SimilarOccurrencesPanel
    status="unavailable"
    visible
    busy={false}
    onReview={vi.fn()}
    onConfirm={vi.fn()}
  />)

  expect(screen.queryByRole('button', { name: 'Consultar novamente' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Enviar mesmo assim' })).toBeVisible()
})

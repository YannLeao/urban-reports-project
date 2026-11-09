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

it('does not expose identifying details from nearby reports', () => {
  render(<SimilarOccurrencesPanel
    status="candidates"
    visible
    busy={false}
    result={{ hasSimilar: true }}
    onReview={vi.fn()}
    onConfirm={vi.fn()}
  />)
  expect(screen.getByText(/Há relatos próximos/)).toBeVisible()
  expect(screen.queryByText('Poste apagado na praça')).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /Consultar relato/ })).not.toBeInTheDocument()
})

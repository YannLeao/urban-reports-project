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
    result={{ radiusMeters: 100, limit: 5, items: [{
      id: '3e85aa3d-19e3-42a3-8861-c435ff5908af', categoryId: 1,
      categoryName: 'Iluminação pública', title: 'Poste apagado na praça',
      neighborhood: 'Centro', reference: 'Praça central', status: 'PENDING',
      createdAt: '2026-09-28T12:00:00Z', distanceMeters: 10,
    }] }}
    onReview={vi.fn()}
    onConfirm={vi.fn()}
  />)
  expect(screen.getByText(/Há relatos próximos/)).toBeVisible()
  expect(screen.queryByText('Poste apagado na praça')).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /Consultar relato/ })).not.toBeInTheDocument()
})

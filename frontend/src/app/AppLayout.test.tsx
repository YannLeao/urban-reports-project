import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { expect, test } from 'vitest'
import { useAppLayout } from './AppLayout'

function LayoutProbe() { return <output aria-label="Composição">{useAppLayout()}</output> }

test.each([
  ['/minha-conta', 'account'],
  ['/minha-conta?origem=inicio', 'account'],
  ['/', 'reading'],
  ['/entrar', 'reading'],
  ['/cadastro', 'reading'],
  ['/registrar-ocorrencia', 'reading'],
  ['/ocorrencias', 'reading'],
  ['/meus-relatos', 'reading'],
  ['/ocorrencias?visao=mapa', 'map'],
  ['/meus-relatos?visao=mapa', 'map'],
  ['/administracao/contas', 'panel'],
  ['/administracao/relatorio', 'panel'],
])('%s selects only its intended composition', (path, expected) => {
  render(<MemoryRouter initialEntries={[path]}><LayoutProbe /></MemoryRouter>)
  expect(screen.getByLabelText('Composição')).toHaveTextContent(expected)
})

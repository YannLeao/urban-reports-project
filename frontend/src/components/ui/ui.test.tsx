import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { Button } from './Button'
import { Input, Select, Textarea } from './Field'
import { StatusBadge } from './Feedback'

test.each(['disabled', 'loading'] as const)('%s button retains its name and prevents click and keyboard activation', async state => {
  const action = vi.fn()
  const user = userEvent.setup()
  render(<Button {...{ [state]: true }} onClick={action}>Salvar exemplo</Button>)
  const button = screen.getByRole('button', { name: 'Salvar exemplo' })
  expect(button).toBeDisabled()
  await user.click(button)
  button.focus()
  await user.keyboard('{Enter} ')
  expect(action).not.toHaveBeenCalled()
  if (state === 'loading') expect(button).toHaveAttribute('aria-busy', 'true')
})
test('button defaults to non-submit and honors explicit submit', async () => {
  const submit = vi.fn((event: React.FormEvent) => event.preventDefault())
  const user = userEvent.setup()
  render(<form onSubmit={submit}><Button>Auxiliar</Button><Button type="submit">Enviar</Button></form>)
  await user.click(screen.getByRole('button', { name: 'Auxiliar' }))
  expect(submit).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Enviar' }))
  expect(submit).toHaveBeenCalledTimes(1)
})
test.each([Input, Textarea, Select])('field associates label, description, error and external description', Control => {
  render(<><p id="external">Ajuda adicional.</p><Control label="Nome" name="name" description="Nome do local." error="Preencha o campo." aria-describedby="external" required /><Input label="Outro nome" /></>)
  const control = screen.getByLabelText('Nome')
  expect(control).toHaveAccessibleDescription('Ajuda adicional. Nome do local. Preencha o campo.')
  expect(control).toHaveAttribute('aria-invalid', 'true')
  expect(control).toBeRequired()
  expect(control).toHaveAttribute('name', 'name')
  expect(control.id).not.toBe(screen.getByLabelText('Outro nome').id)
})
test('field preserves explicit id, ref, change handler and native options', async () => {
  const change = vi.fn()
  const ref = { current: null }
  const user = userEvent.setup()
  render(<Select label="Opção" id="option" ref={ref} onChange={change}><option value="a">Primeira</option><option value="b">Segunda</option></Select>)
  const control = screen.getByLabelText('Opção')
  expect(control.id).toBe('option')
  expect(ref.current).toBe(control)
  await user.selectOptions(control, 'b')
  expect(change).toHaveBeenCalledTimes(1)
  expect(control).toHaveValue('b')
})
test('badge conveys status through a text label, with a decorative symbol', () => {
  render(<StatusBadge tone="success" label="Conexão confirmada" />)
  expect(screen.getByText('Conexão confirmada')).toBeVisible()
  expect(screen.getByText('✓')).toHaveAttribute('aria-hidden', 'true')
})

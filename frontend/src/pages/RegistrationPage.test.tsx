import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, expect, test, vi } from 'vitest'
import { RegistrationPage } from './RegistrationPage'

const fetchMock = vi.fn<typeof fetch>()
const password = '  uma frase sintética 🔐  '
beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('VITE_API_URL', 'https://api.example.com/base/')
})
function renderForm() {
  return render(<MemoryRouter><RegistrationPage /></MemoryRouter>)
}
function fill() {
  fireEvent.change(screen.getByLabelText('Nome'), { target: { value: '  Ána Silva  ' } })
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: ' USER+tag@EXAMPLE.COM ' } })
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: password } })
  fireEvent.change(screen.getByLabelText('Confirmar senha'), { target: { value: password } })
}
const success = { id: '3e85aa3d-19e3-42a3-8861-c435ff5908af', name: 'Ána Silva', email: 'user+tag@example.com', role: 'USER' }

test('serializes only canonical API fields, omits credentials and blocks repeated submission', async () => {
  let resolve!: (response: Response) => void
  fetchMock.mockReturnValue(new Promise<Response>((done) => { resolve = done }))
  renderForm()
  fill()
  const button = screen.getByRole('button', { name: 'Criar conta' })
  fireEvent.click(button)
  fireEvent.click(button)
  expect(button).toBeDisabled()
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fetchMock).toHaveBeenCalledWith('https://api.example.com/base/api/auth/register', {
    method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Ána Silva', email: 'user+tag@example.com', password }),
  })
  await act(async () => { resolve(Response.json(success, { status: 201 })) })
  const heading = await screen.findByRole('heading', { name: 'Conta criada' })
  await waitFor(() => expect(heading).toHaveFocus())
  expect(screen.queryByLabelText('Senha')).not.toBeInTheDocument()
  expect(screen.getByText(/Você ainda não está conectado/)).toBeVisible()
  expect(screen.getByRole('link', { name: 'Voltar ao início' })).toHaveAttribute('href', '/')
})

test('local errors focus first field and preserve passwords without a request', async () => {
  renderForm()
  fill()
  fireEvent.change(screen.getByLabelText('Confirmar senha'), { target: { value: 'different' } })
  await userEvent.click(screen.getByRole('button', { name: 'Criar conta' }))
  expect(screen.getByText('As senhas precisam ser iguais.')).toBeVisible()
  await waitFor(() => expect(screen.getByLabelText('Confirmar senha')).toHaveFocus())
  expect(screen.getByLabelText('Senha')).toHaveValue(password)
  expect(fetchMock).not.toHaveBeenCalled()
})

test.each(['conflict', 'fields', 'network', 'invalid-success', 'server', 'invalid-json'])('%s failure keeps identity, clears secrets and explains next step', async (kind) => {
  if (kind === 'network') fetchMock.mockRejectedValue(new TypeError('private details'))
  else if (kind === 'invalid-success') fetchMock.mockResolvedValue(Response.json({ token: 'unexpected' }, { status: 201 }))
  else if (kind === 'invalid-json') fetchMock.mockResolvedValue(new Response('<html>', { status: 502 }))
  else fetchMock.mockResolvedValue(Response.json({
    code: kind === 'conflict' ? 'EMAIL_ALREADY_REGISTERED' : kind === 'fields' ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR',
    fieldErrors: kind === 'fields' ? { name: ['INVALID_NAME'] } : undefined,
    message: 'private details',
  }, { status: kind === 'conflict' ? 409 : kind === 'fields' ? 400 : 500 }))
  renderForm()
  fill()
  await userEvent.click(screen.getByRole('button', { name: 'Criar conta' }))
  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('Preencha a senha e a confirmação novamente.')
  expect(alert).not.toHaveTextContent('private details')
  expect(screen.getByLabelText('Nome')).toHaveValue('  Ána Silva  ')
  expect(screen.getByLabelText('E-mail')).toHaveValue('USER+tag@EXAMPLE.COM')
  expect(screen.getByLabelText('Senha')).toHaveValue('')
  expect(screen.getByLabelText('Confirmar senha')).toHaveValue('')
  expect(fetchMock).toHaveBeenCalledTimes(1)
  if (kind === 'conflict') {
    expect(screen.getByText('Este e-mail já está cadastrado.')).toBeVisible()
    await waitFor(() => expect(screen.getByLabelText('E-mail')).toHaveFocus())
  } else if (kind === 'fields') {
    await waitFor(() => expect(screen.getByLabelText('Nome')).toHaveFocus())
  } else {
    await waitFor(() => expect(alert).toHaveFocus())
    if (kind !== 'server') expect(alert).toHaveTextContent('A conta pode ter sido criada.')
  }
})

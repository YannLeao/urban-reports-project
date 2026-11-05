import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { AppRoutes } from '../app/routes'
import { PasswordRecoveryAccess } from '../app/ProductIntegrations'
import { PasswordRecoveryRequestPage } from './PasswordRecoveryRequestPage'

const fetchMock = vi.fn<typeof fetch>()
beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('VITE_API_URL', 'https://api.example.com/base/')
})
function renderPage() {
  return render(<MemoryRouter><PasswordRecoveryRequestPage /></MemoryRouter>)
}

test('sends only the normalized e-mail, omits credentials, blocks repeated submission and shows a neutral confirmation', async () => {
  let resolve!: (response: Response) => void
  fetchMock.mockReturnValue(new Promise<Response>((done) => { resolve = done }))
  renderPage()
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: ' ANA@Example.com ' } })
  const button = screen.getByRole('button', { name: 'Enviar link' })
  fireEvent.click(button)
  fireEvent.click(button)
  expect(button).toBeDisabled()
  expect(fetchMock).toHaveBeenCalledTimes(1)
  const [url, options] = fetchMock.mock.calls[0]
  expect(url).toBe('https://api.example.com/base/api/auth/password-recovery-requests')
  expect(options).toMatchObject({ method: 'POST', credentials: 'omit' })
  expect(JSON.parse(String(options?.body))).toEqual({ email: 'ana@example.com' })
  await act(async () => { resolve(Response.json({ requested: true }, { status: 202 })) })
  const heading = await screen.findByRole('heading', { name: 'Verifique seu e-mail' })
  await waitFor(() => expect(heading).toHaveFocus())
  expect(screen.getByText(/Se houver uma conta ativa com este e-mail/)).toBeVisible()
  expect(screen.queryByLabelText('E-mail')).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Voltar para entrar' })).toHaveAttribute('href', '/entrar')
})

test('an invalid e-mail is reported locally, keeps focus on the field and makes no request', async () => {
  renderPage()
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'invalido' } })
  await userEvent.click(screen.getByRole('button', { name: 'Enviar link' }))
  expect(screen.getByText('Informe um e-mail válido.')).toBeVisible()
  await waitFor(() => expect(screen.getByLabelText('E-mail')).toHaveFocus())
  expect(fetchMock).not.toHaveBeenCalled()
})

test.each(['network', 'server', 'uncertain'])('%s failure keeps the e-mail and never claims the request was sent', async (kind) => {
  if (kind === 'network') fetchMock.mockImplementation(() => Promise.reject(new TypeError('private details')))
  else if (kind === 'uncertain') fetchMock.mockResolvedValue(Response.json({ requested: true }, { status: 200 }))
  else fetchMock.mockResolvedValue(Response.json({ code: 'INTERNAL_ERROR', message: 'private details' }, { status: 500 }))
  renderPage()
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'ana@example.com' } })
  await userEvent.click(screen.getByRole('button', { name: 'Enviar link' }))
  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('Não foi possível enviar o pedido')
  expect(alert).not.toHaveTextContent('private details')
  await waitFor(() => expect(alert).toHaveFocus())
  expect(screen.getByLabelText('E-mail')).toHaveValue('ana@example.com')
  expect(screen.queryByRole('heading', { name: 'Verifique seu e-mail' })).not.toBeInTheDocument()
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

test('the login entry point links to the request page', () => {
  render(<MemoryRouter><PasswordRecoveryAccess /></MemoryRouter>)
  expect(screen.getByRole('link', { name: 'Esqueci minha senha' })).toHaveAttribute('href', '/esqueci-minha-senha')
})

test.each([['/esqueci-minha-senha', 'Recuperar senha'], ['/redefinir-senha', 'Redefinir senha']])('route %s is public and renders its page', (path, title) => {
  render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>)
  expect(screen.getByRole('heading', { level: 1, name: title })).toBeVisible()
})

afterEach(() => { vi.useRealTimers() })

test('allows a neutral repeat only after sixty seconds and starts a new interval', async () => {
  vi.useFakeTimers()
  fetchMock.mockImplementation(() => Promise.resolve(Response.json({ requested: true }, { status: 202 })))
  renderPage()
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'ana@example.com' } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Enviar link' })) })
  const repeat = screen.getByRole('button', { name: 'Solicitar novamente' })
  expect(repeat).toBeDisabled()
  await act(async () => { vi.advanceTimersByTime(59_000) })
  fireEvent.click(repeat)
  expect(fetchMock).toHaveBeenCalledTimes(1)
  await act(async () => { vi.advanceTimersByTime(1000) })
  expect(repeat).toBeEnabled()
  await act(async () => { fireEvent.click(repeat); fireEvent.click(repeat) })
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(repeat).toBeDisabled()
  expect(screen.getByRole('heading', { name: 'Verifique seu e-mail' })).toHaveFocus()
})

test('repeat failure keeps the generic confirmation and makes a manual retry possible', async () => {
  vi.useFakeTimers()
  fetchMock.mockResolvedValueOnce(Response.json({ requested: true }, { status: 202 }))
  renderPage()
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'ana@example.com' } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Enviar link' })) })
  await act(async () => { vi.advanceTimersByTime(60_000) })
  fetchMock.mockRejectedValueOnce(new TypeError('sentinel private error'))
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Solicitar novamente' })) })
  expect(screen.getByRole('alert')).toHaveFocus()
  expect(screen.getByRole('alert')).not.toHaveTextContent('sentinel')
  expect(screen.getByRole('heading', { name: 'Verifique seu e-mail' })).toBeVisible()
  expect(screen.getByRole('button', { name: 'Solicitar novamente' })).toBeEnabled()
})

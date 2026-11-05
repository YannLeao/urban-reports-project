import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, expect, test, vi } from 'vitest'
import { PasswordResetPage } from './PasswordResetPage'

const fetchMock = vi.fn<typeof fetch>()
const token = 'a'.repeat(43)
const password = 'synthetic valid password phrase'
beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('VITE_API_URL', 'https://api.example.com/base/')
  window.history.replaceState(null, '', `/redefinir-senha#token=${token}`)
})
function renderPage() {
  return render(<MemoryRouter><PasswordResetPage /></MemoryRouter>)
}
function fill(confirmation = password) {
  fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: password } })
  fireEvent.change(screen.getByLabelText('Confirmar nova senha'), { target: { value: confirmation } })
}

test('captures the token from the fragment, removes it from the address and sends only token and password', async () => {
  let resolve!: (response: Response) => void
  fetchMock.mockReturnValue(new Promise<Response>((done) => { resolve = done }))
  renderPage()
  expect(window.location.hash).toBe('')
  fill()
  const button = screen.getByRole('button', { name: 'Redefinir senha' })
  fireEvent.click(button)
  fireEvent.click(button)
  expect(button).toBeDisabled()
  expect(fetchMock).toHaveBeenCalledTimes(1)
  const [url, options] = fetchMock.mock.calls[0]
  expect(url).toBe('https://api.example.com/base/api/auth/password-resets')
  expect(options).toMatchObject({ method: 'POST', credentials: 'omit' })
  expect(JSON.parse(String(options?.body))).toEqual({ token, password })
  await act(async () => { resolve(Response.json({ reset: true })) })
  const heading = await screen.findByRole('heading', { name: 'Senha redefinida' })
  await waitFor(() => expect(heading).toHaveFocus())
  expect(screen.queryByLabelText('Nova senha')).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/entrar')
})

test.each(['', '#token=curto', `#other=${'a'.repeat(43)}`])('missing or malformed token %j shows the invalid link state without a request', (hash) => {
  window.history.replaceState(null, '', `/redefinir-senha${hash}`)
  renderPage()
  expect(screen.getByRole('alert')).toHaveTextContent('Link inválido ou expirado')
  expect(screen.getByRole('link', { name: 'Solicitar novo link' })).toHaveAttribute('href', '/esqueci-minha-senha')
  expect(screen.queryByLabelText('Nova senha')).not.toBeInTheDocument()
  expect(fetchMock).not.toHaveBeenCalled()
})

test('local errors focus the first invalid field, keep the typed passwords and make no request', async () => {
  renderPage()
  fill('outra senha qualquer')
  await userEvent.click(screen.getByRole('button', { name: 'Redefinir senha' }))
  expect(screen.getByText('As senhas precisam ser iguais.')).toBeVisible()
  await waitFor(() => expect(screen.getByLabelText('Confirmar nova senha')).toHaveFocus())
  expect(screen.getByLabelText('Nova senha')).toHaveValue(password)
  expect(fetchMock).not.toHaveBeenCalled()
})

test('a rejected link replaces the form with the invalid link state and hides server details', async () => {
  fetchMock.mockResolvedValue(Response.json({ code: 'INVALID_RECOVERY_LINK', message: 'private details' }, { status: 400 }))
  renderPage()
  fill()
  await userEvent.click(screen.getByRole('button', { name: 'Redefinir senha' }))
  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('Link inválido ou expirado')
  expect(alert).not.toHaveTextContent('private details')
  expect(screen.queryByLabelText('Nova senha')).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Solicitar novo link' })).toBeVisible()
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

test.each(['network', 'server', 'uncertain'])('%s failure clears the passwords and explains the next step', async (kind) => {
  if (kind === 'network') fetchMock.mockImplementation(() => Promise.reject(new TypeError('private details')))
  else if (kind === 'uncertain') fetchMock.mockResolvedValue(Response.json({ reset: true }, { status: 202 }))
  else fetchMock.mockResolvedValue(Response.json({ code: 'INTERNAL_ERROR', message: 'private details' }, { status: 500 }))
  renderPage()
  fill()
  await userEvent.click(screen.getByRole('button', { name: 'Redefinir senha' }))
  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('Não foi possível confirmar a redefinição.')
  expect(alert).not.toHaveTextContent('private details')
  await waitFor(() => expect(alert).toHaveFocus())
  expect(screen.getByLabelText('Nova senha')).toHaveValue('')
  expect(screen.getByLabelText('Confirmar nova senha')).toHaveValue('')
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

test('reload after fragment removal explains how to reopen the link without persisting the secret', () => {
  const first = renderPage()
  expect(window.location.hash).toBe('')
  first.unmount()
  renderPage()
  expect(screen.getByText(/Se você recarregou esta página/)).toBeVisible()
  expect(screen.queryByLabelText('Nova senha')).not.toBeInTheDocument()
  expect(window.sessionStorage.getItem('token')).toBeNull()
  expect(window.localStorage.getItem('token')).toBeNull()
  expect(fetchMock).not.toHaveBeenCalled()
})

test('server password validation keeps the link available and focuses a correctable field', async () => {
  fetchMock.mockResolvedValue(Response.json({ code: 'INVALID_PASSWORD' }, { status: 400 }))
  renderPage(); fill()
  await userEvent.click(screen.getByRole('button', { name: 'Redefinir senha' }))
  await waitFor(() => expect(screen.getByLabelText('Nova senha')).toHaveFocus())
  expect(screen.getByLabelText('Nova senha')).toHaveValue('')
  expect(screen.getByLabelText('Nova senha')).toHaveAttribute('aria-invalid', 'true')
  expect(screen.queryByText(/ela pode ter sido alterada/)).not.toBeInTheDocument()
})

test('too many reset attempts give a waiting instruction without losing the in-memory link', async () => {
  fetchMock.mockResolvedValue(Response.json({ code: 'RECOVERY_RATE_LIMITED' }, { status: 429 }))
  renderPage(); fill()
  await userEvent.click(screen.getByRole('button', { name: 'Redefinir senha' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Muitas tentativas')
  expect(screen.getByLabelText('Nova senha')).toHaveValue('')
})

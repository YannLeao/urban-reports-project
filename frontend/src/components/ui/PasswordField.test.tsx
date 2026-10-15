import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef, useState } from 'react'
import { expect, test, vi } from 'vitest'
import { PasswordField } from './PasswordField'

test('each toggle preserves value, label, errors and input ref without submitting or revealing confirmation', async () => {
  const submitted = vi.fn()
  function Form() {
    const [password, setPassword] = useState('')
    const input = useRef<HTMLInputElement>(null)
    return <form aria-label="Acesso" onSubmit={event => { event.preventDefault(); submitted() }}>
      <PasswordField ref={input} label="Senha" autoComplete="new-password" error="Use de 15 a 128 caracteres."
        value={password} onChange={event => setPassword(event.target.value)} />
      <PasswordField label="Confirme a senha" autoComplete="new-password" />
      <button type="button" onClick={() => input.current?.focus()}>Focar senha</button>
    </form>
  }
  const user = userEvent.setup()
  render(<Form />)
  const password = screen.getByLabelText('Senha')
  await user.type(password, ' Uma frase com acentos é boa 💡 ')
  const toggle = within(password.parentElement!).getByRole('button', { name: 'Mostrar senha' })
  expect(toggle).toHaveAttribute('type', 'button')
  await user.click(toggle)
  expect(password).toHaveAttribute('type', 'text')
  expect(password).toHaveValue(' Uma frase com acentos é boa 💡 ')
  expect(password).toHaveAccessibleDescription('Use de 15 a 128 caracteres.')
  expect(password).toHaveAttribute('aria-invalid', 'true')
  expect(password).toHaveAttribute('autocomplete', 'new-password')
  expect(screen.getByLabelText('Confirme a senha')).toHaveAttribute('type', 'password')
  expect(toggle).toHaveAccessibleName('Ocultar senha')
  expect(toggle).toHaveFocus()
  await user.click(toggle)
  expect(password).toHaveAttribute('type', 'password')
  expect(submitted).not.toHaveBeenCalled()
  await user.click(screen.getByText('Focar senha'))
  expect(password).toHaveFocus()
})

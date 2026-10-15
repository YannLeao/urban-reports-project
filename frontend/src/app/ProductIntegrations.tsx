import { useId, useState } from 'react'
import { Icon } from '../components/ui/Icon'

// Replace these preparations with real route links when their flows are integrated.
// No recovery or notifications route exists in this checkout.
export function PasswordRecoveryAccess() {
  return <p className="mb-0 text-small text-text-secondary">Recuperação de senha em breve</p>
}

export function NotificationsAccess() {
  const id = useId()
  const [helpVisible, setHelpVisible] = useState(false)
  return <div className="relative" onMouseEnter={() => setHelpVisible(true)} onMouseLeave={() => setHelpVisible(false)}>
    <button type="button" onFocus={() => setHelpVisible(true)} onBlur={() => setHelpVisible(false)} onClick={() => setHelpVisible(true)} onKeyDown={event => { if (event.key === 'Escape') setHelpVisible(false) }} aria-label="Notificações" aria-disabled="true" aria-describedby={id}
      className="inline-flex min-h-target min-w-target items-center justify-center rounded-pill border border-border-subtle text-text-secondary">
      <Icon name="bell" />
    </button>
    <p id={id} role="tooltip" hidden={!helpVisible} className="absolute right-0 top-full z-30 mt-2 w-48 rounded-control border border-border-control bg-surface-raised p-3 text-small shadow-card">Notificações em breve</p>
  </div>
}

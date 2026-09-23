import type { ComponentProps } from 'react'
import { buttonStyles, type ButtonVariant } from './button-styles'

type Props = ComponentProps<'button'> & {
  variant?: ButtonVariant
  loading?: boolean
}
export function Button({ variant = 'primary', loading = false, disabled, type = 'button', className = '', children, ...props }: Props) {
  return <button {...props} type={type} className={buttonStyles(variant, className)}
    disabled={disabled || loading} aria-busy={loading || undefined} data-loading={loading || undefined}>
    {loading && <span aria-hidden="true">◌ </span>}{children}
  </button>
}

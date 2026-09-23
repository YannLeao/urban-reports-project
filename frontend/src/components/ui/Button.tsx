import type { ComponentProps } from 'react'

type Props = ComponentProps<'button'> & {
  variant?: 'primary' | 'secondary' | 'quiet'
  loading?: boolean
}
export function Button({ variant = 'primary', loading = false, disabled, type = 'button', className = '', children, ...props }: Props) {
  return <button {...props} type={type} className={`button button-${variant} ${className}`}
    disabled={disabled || loading} aria-busy={loading || undefined} data-loading={loading || undefined}>
    {loading && <span aria-hidden="true">◌ </span>}{children}
  </button>
}

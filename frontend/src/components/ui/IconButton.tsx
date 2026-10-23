import type { ComponentProps } from 'react'
import { Button } from './Button'
import { Icon, type IconName } from './Icon'

export function IconButton({ icon, label, className = '', loading = false, ...props }: Omit<ComponentProps<typeof Button>, 'children'> & { icon: IconName; label: string }) {
  return <Button {...props} variant={props.variant ?? 'secondary'} aria-label={label} title={label}
    aria-busy={loading || undefined} disabled={props.disabled || loading}
    className={`h-target w-target min-w-target shrink-0 p-0! ${className}`}>
    <Icon name={icon} className={loading ? 'animate-spin' : ''} />
  </Button>
}

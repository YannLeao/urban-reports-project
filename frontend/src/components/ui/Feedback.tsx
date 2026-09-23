import type { ComponentProps } from 'react'

type Tone = 'success' | 'warning' | 'danger' | 'info'
const symbols = { success: '✓', warning: '!', danger: '!', info: 'i' } as const
export function Alert({ tone = 'info', role = 'status', className = '', children, ...props }: ComponentProps<'div'> & { tone?: Tone }) {
  return <div {...props} role={role} className={`feedback feedback-${tone} ${className}`}>{children}</div>
}
export function StatusBadge({ tone = 'info', label }: { tone?: Tone; label: string }) {
  return <span className={`badge feedback-${tone}`}><span aria-hidden="true">{symbols[tone]}</span>{label}</span>
}

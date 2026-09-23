import type { ComponentProps } from 'react'

type Tone = 'success' | 'warning' | 'danger' | 'info'
const tones: Record<Tone, string> = {
  success: 'bg-feedback-success-background text-feedback-success-foreground',
  warning: 'bg-feedback-warning-background text-feedback-warning-foreground',
  danger: 'bg-feedback-danger-background text-feedback-danger-foreground',
  info: 'bg-feedback-info-background text-feedback-info-foreground',
}
const symbols = { success: '✓', warning: '!', danger: '!', info: 'i' } as const
export function Alert({ tone = 'info', role = 'status', className = '', children, ...props }: ComponentProps<'div'> & { tone?: Tone }) {
  return <div {...props} role={role} className={`p-6 border-l-[3px] border-l-current rounded-control [&>:last-child]:mb-0 ${tones[tone]} ${className}`}>{children}</div>
}
export function StatusBadge({ tone = 'info', label }: { tone?: Tone; label: string }) {
  return <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-pill text-small font-bold ${tones[tone]}`}><span aria-hidden="true">{symbols[tone]}</span>{label}</span>
}

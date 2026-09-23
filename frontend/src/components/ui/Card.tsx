import type { ComponentProps } from 'react'
export function Card({ className = '', ...props }: ComponentProps<'section'>) {
  return <section {...props} className={`p-6 md:p-8 border border-border-subtle rounded-card bg-surface-raised shadow-card ${className}`} />
}

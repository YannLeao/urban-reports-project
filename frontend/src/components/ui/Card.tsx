import type { ComponentProps } from 'react'
export function Card({ className = '', density = 'default', ...props }: ComponentProps<'section'> & { density?: 'default' | 'compact' }) {
  return <section {...props} className={`${density === 'compact' ? 'p-4' : 'p-6 md:p-8'} border border-border-subtle rounded-card bg-surface-raised shadow-card ${className}`} />
}

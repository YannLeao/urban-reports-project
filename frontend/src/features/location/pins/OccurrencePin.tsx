import { useId, type SVGProps } from 'react'
import type { CategoryId } from '../../occurrence/category'
import { categoryPins } from './pin-variants'

// Converted from the provided 64 × 76 SVGs; geometry is unchanged.
const symbols = {
  arborizacao: <><path d="M44 18c-17-2-25 5-24 16 0 7 5 11 11 11 11 0 16-10 13-27ZM24 41c4-7 9-12 17-17" fill="none" stroke="var(--ds-surface-raised)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/></>,
  buraco: <><path d="M18 23h10l4 4 4-4h10M18 38h10l4-4 4 4h10" fill="none" stroke="var(--ds-surface-raised)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/></>,
  generico: <><circle cx="32" cy="30" r="10" fill="var(--ds-brand-accent)"/></>,
  iluminacao: <><path d="M26 35c0-3-5-5-5-12a11 11 0 0 1 22 0c0 7-5 9-5 12M27 38h10M28 43h8" fill="none" stroke="var(--ds-surface-raised)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/></>,
  limpeza: <><path d="M23 24h18l-1.5 20h-15L23 24ZM21 20h22M28 19v-3h8v3M29 29v10M35 29v10" fill="none" stroke="var(--ds-surface-raised)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></>,
  saneamento: <><path d="M32 16c-4 6-11 13-11 19a11 11 0 0 0 22 0c0-6-7-13-11-19Z" fill="none" stroke="var(--ds-surface-raised)" strokeWidth="3.5" strokeLinejoin="round"/><path d="M27 36c0 3 2 5 5 5" fill="none" stroke="var(--ds-surface-raised)" strokeWidth="3" strokeLinecap="round"/></>,
}
export function OccurrencePin({ categoryId, selected = false, size = 48, label, ...props }: Omit<SVGProps<SVGSVGElement>, 'width' | 'height'> & {
  categoryId: CategoryId; selected?: boolean; size?: number; label?: string
}) {
  const id = useId()
  const variant = categoryPins[categoryId]
  return <svg {...props} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 76" width={size} height={size * 76 / 64}
    role={label ? 'img' : undefined} aria-labelledby={label ? id : undefined} aria-hidden={label ? undefined : true} focusable="false">
    {label && <title id={id}>{label}</title>}
    <path d="M32 4C16.5 4 5 15.5 5 30c0 18.1 21.7 38.7 25.1 41.9a2.8 2.8 0 0 0 3.8 0C37.3 68.7 59 48.1 59 30 59 15.5 47.5 4 32 4Z" fill="var(--ds-brand-default)" stroke={selected ? 'var(--ds-brand-deep)' : 'var(--ds-surface-raised)'} strokeWidth={selected ? 4 : 2} strokeLinejoin="round"/>
    {selected && variant === 'generico' ? <circle cx="32" cy="30" r="10" fill="var(--ds-surface-raised)" /> : symbols[variant]}
  </svg>
}

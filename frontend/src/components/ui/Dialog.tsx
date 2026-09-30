import type { ComponentPropsWithRef } from 'react'

// Native modal supplies inert background and Escape; explicit Tab cycling avoids
// Chromium's temporary document focus after the final control.
export function Dialog({ onKeyDown, ...props }: ComponentPropsWithRef<'dialog'>) {
  return <dialog {...props} onKeyDown={event => {
    onKeyDown?.(event)
    if (event.defaultPrevented || event.key !== 'Tab') return
    const controls = [...event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )].filter(element => element.getClientRects().length > 0)
    const first = controls[0]
    const last = controls.at(-1)
    if (!first) { event.preventDefault(); return }
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }} />
}

import type { FocusEvent } from 'react'

export function revealFocusedControl(event: FocusEvent<HTMLElement>) {
  const target = event.target
  // Browser focus scrolling does not account for the fixed mobile navigation.
  requestAnimationFrame(() => {
    if (document.activeElement !== target) return
    const navigation = document.querySelector('nav[aria-label="Navegação principal"]')
    if (!navigation || getComputedStyle(navigation).position !== 'fixed') return
    const bounds = target.getBoundingClientRect()
    const style = getComputedStyle(target)
    const focusSpace = Math.max(0, parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset))
    if (bounds.bottom + focusSpace > navigation.getBoundingClientRect().top || bounds.top - focusSpace < 0) {
      target.scrollIntoView({ block: 'center', behavior: 'instant' })
    }
  })
}

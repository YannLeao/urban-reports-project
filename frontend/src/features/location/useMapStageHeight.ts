import { useLayoutEffect, useState, type RefObject } from 'react'

// Measure the actual wrapped controls/navigation. CSS retains a viewport fallback
// and a minimum for short screens/zoom, where ordinary page scrolling is needed.
export function useMapStageHeight(stage: RefObject<HTMLDivElement | null>, enabled: boolean) {
  const [height, setHeight] = useState<number>()
  useLayoutEffect(() => {
    const element = stage.current
    if (!enabled || !element) return
    const navigation = document.querySelector('nav[aria-label="Navegação principal"]')
    function measure() {
      if (!element) return
      const bottom = navigation && getComputedStyle(navigation).position === 'fixed' ? navigation.getBoundingClientRect().height : 0
      const top = element.getBoundingClientRect().top + window.scrollY
      const gap = parseFloat(getComputedStyle(element).rowGap) || 0
      const available = Math.max(0, Math.floor((window.visualViewport?.height ?? window.innerHeight) - top - bottom - gap))
      setHeight(previous => previous === available ? previous : available)
    }
    measure()
    const observer = new ResizeObserver(measure)
    if (element.parentElement) observer.observe(element.parentElement)
    if (navigation) observer.observe(navigation)
    const header = document.querySelector('header')
    if (header) observer.observe(header)
    window.addEventListener('resize', measure)
    window.visualViewport?.addEventListener('resize', measure)
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); window.visualViewport?.removeEventListener('resize', measure) }
  }, [stage, enabled])
  return height
}

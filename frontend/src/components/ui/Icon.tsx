const paths = {
  camera: 'M4 7h4l2-3h4l2 3h4v13H4V7ZM16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  eyeOff: 'M3 3l18 18M10 5a12 12 0 0 1 2 0c6 0 10 7 10 7a20 20 0 0 1-4 4M6 6a22 22 0 0 0-4 6s4 7 10 7a13 13 0 0 0 5-1M9 9a4 4 0 0 0 6 6',
  map: 'M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2V6ZM9 4v14m6-12v14',
  plus: 'M12 5v14M5 12h14',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  user: 'M5 21v-2a7 7 0 0 1 14 0v2M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  bell: 'M6 17V10a6 6 0 0 1 12 0v7l2 2H4l2-2ZM10 22h4',
  chart: 'M4 3v17h17M9 16v-5m5 5V6m5 10v-7',
  location: 'M12 2v3m0 14v3M2 12h3m14 0h3M19 12a7 7 0 1 1-14 0 7 7 0 0 1 14 0ZM12 10v4m-2-2h4',
  refresh: 'M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 6M4 12l2 6a7 7 0 0 0 12-1',
  close: 'M6 6l12 12M18 6 6 18',
} as const

export type IconName = keyof typeof paths
export function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  return <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className={`shrink-0 ${className}`}><path d={paths[name]} /></svg>
}

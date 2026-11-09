import { Link } from 'react-router'
import { Icon } from '../../components/ui/Icon'
import { OccurrencePin } from '../location/pins/OccurrencePin'

// Original schematic illustration: no real locations or occurrence counts.
export function CommunityMapPreview() {
  return <div className="relative isolate overflow-hidden rounded-card border border-border-subtle bg-surface-soft shadow-card">
    <div className="relative aspect-[5/4] overflow-hidden" aria-label="Mapa ilustrativo com pinos de iluminação, limpeza e arborização" role="img">
      <svg viewBox="0 0 600 480" className="absolute size-full" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <rect width="600" height="480" fill="var(--ds-surface-soft)" />
        <g fill="var(--ds-surface-raised)" stroke="var(--ds-border-subtle)" strokeWidth="2">
          {[0, 1, 2, 3, 4].flatMap(row => [0, 1, 2, 3, 4].map(col => <rect key={`${row}-${col}`} x={col * 135 - 35} y={row * 105 - 20} width="110" height="80" rx="12" />))}
        </g>
        <path d="M-30 425C90 355 90 170 220 185S360 355 640 75" fill="none" stroke="var(--ds-brand-accent)" strokeWidth="70" />
        <path d="M-30 425C90 355 90 170 220 185S360 355 640 75" fill="none" stroke="var(--ds-surface-raised)" strokeWidth="12" />
        <path d="M-10 105 610 420M400-20 170 500" stroke="var(--ds-surface-raised)" strokeWidth="23" />
        <rect x="390" y="55" width="105" height="85" rx="24" fill="var(--ds-brand-accent)" />
        <g fill="var(--ds-brand-default)" opacity=".25"><circle cx="413" cy="79" r="10" /><circle cx="450" cy="101" r="14" /><circle cx="469" cy="74" r="9" /></g>
      </svg>
      <div className="absolute left-[23%] top-[23%] -rotate-6"><OccurrencePin categoryId={1} size={52} /></div>
      <div className="absolute left-[51%] top-[53%]"><OccurrencePin categoryId={3} size={60} selected /></div>
      <div className="absolute left-[73%] top-[15%] rotate-6"><OccurrencePin categoryId={7} size={48} /></div>
      <span className="absolute bottom-4 left-4 rounded-pill bg-surface-raised px-3 py-2 text-small font-bold shadow-card">Belo Jardim · Ilustração</span>
      <span className="absolute right-4 top-4 rounded-pill bg-surface-raised p-3 shadow-card"><Icon name="location" /></span>
    </div>
    <Link to="/ocorrencias?visao=mapa" className="flex min-h-target items-center justify-between gap-3 bg-surface-raised p-4 font-bold no-underline hover:bg-brand-accent"><span className="flex items-center gap-2"><Icon name="map" />O que acontece na sua cidade?</span><Icon name="chevronRight" /></Link>
  </div>
}

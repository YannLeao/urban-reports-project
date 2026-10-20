import { Icon } from '../../components/ui/Icon'

export function VideoPlaceholder({ duration, compact = false, flush = false }: { duration?: number; compact?: boolean; flush?: boolean }) {
  return <div className={`flex flex-col items-center justify-center gap-2 bg-surface-raised p-3 text-center text-small text-text-secondary ${compact ? 'size-20 shrink-0 rounded-control' : flush ? 'aspect-[4/3] w-full rounded-t-card' : 'my-4 aspect-[4/3] w-full rounded-card'}`} aria-label="Vídeo do relato">
    <Icon name="play" /><span>Vídeo{duration != null ? ` · ${duration.toFixed(1)} s` : ''}</span>
  </div>
}

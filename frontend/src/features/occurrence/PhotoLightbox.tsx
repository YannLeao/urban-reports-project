import { useEffect, useId, useRef, type RefObject } from 'react'
import { Dialog } from '../../components/ui/Dialog'
import { Button } from '../../components/ui/Button'
import { Icon } from '../../components/ui/Icon'

export function PhotoLightbox({ photo, onClose, trigger }: {
  photo: { src: string; alt: string; caption: string } | null
  onClose: () => void
  trigger: RefObject<HTMLElement | null>
}) {
  const id = useId()
  const dialog = useRef<HTMLDialogElement>(null)
  const close = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const element = dialog.current
    if (photo && element && !element.open) { element.showModal(); close.current?.focus() }
    else if (!photo && element?.open) element.close()
  }, [photo])
  return <Dialog ref={dialog} aria-labelledby={id} onClose={() => { onClose(); trigger.current?.focus() }}
    className="m-auto max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-app overflow-y-auto rounded-card border border-border-control bg-surface-raised p-3 text-text-primary backdrop:bg-text-primary/70 sm:p-5">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div><h2 id={id} className="mb-1 text-title">Foto ampliada</h2><p className="mb-0 text-small text-text-secondary">{photo?.caption}</p></div>
      <Button ref={close} variant="secondary" onClick={() => dialog.current?.close()}><Icon name="close" />Fechar</Button>
    </div>
    {photo && <img src={photo.src} alt={photo.alt} className="max-h-[72svh] w-full rounded-control object-contain" />}
  </Dialog>
}

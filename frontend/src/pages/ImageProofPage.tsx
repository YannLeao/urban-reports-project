import { useState } from 'react'
import { ImagePicker } from '../features/image/ImagePicker'

export function ImageProofPage() {
  const [file, setFile] = useState<File | null>(null)
  return <>
    <section className="pt-12 pb-8 md:pt-16" aria-labelledby="page-title">
      <p className="mb-3 text-small font-bold text-brand-default">Demonstração técnica</p>
      <h1 id="page-title">Teste de fotografia</h1>
      <p className="mb-0 text-lead text-text-secondary">A imagem fica apenas nesta página e não é enviada.</p>
      <p>Ao atualizar ou sair desta página, você perde a seleção.</p>
    </section>
    <ImagePicker value={file} onChange={setFile} />
  </>
}

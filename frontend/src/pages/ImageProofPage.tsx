import { useState } from 'react'
import { ImagePicker } from '../features/image/ImagePicker'

export function ImageProofPage() {
  const [file, setFile] = useState<File | null>(null)
  return <>
    <section className="intro" aria-labelledby="page-title">
      <p className="eyebrow">Demonstração técnica</p>
      <h1 id="page-title">Teste de fotografia</h1>
      <p className="intro-copy">A imagem fica apenas nesta página e não é enviada.</p>
      <p className="mt-4">Ao atualizar ou sair desta página, você perde a seleção.</p>
    </section>
    <ImagePicker value={file} onChange={setFile} />
  </>
}

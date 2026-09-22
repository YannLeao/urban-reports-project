import { Link } from 'react-router'

export function HomePage() {
  return (
    <section className="intro" aria-labelledby="page-title">
      <p className="eyebrow">Plataforma de ocorrências urbanas</p>
      <h1 id="page-title">Tudo começa pelo que acontece na sua cidade.</h1>
      <p className="intro-copy">
        Um espaço simples para registrar, acompanhar e dar visibilidade aos
        problemas urbanos.
      </p>
      <div className="mt-6 flex flex-wrap gap-4">
        <Link className="action-button" to="/status">Verificar API</Link>
      </div>
    </section>
  )
}

import { Link } from 'react-router'

export function HomePage() {
  return (
    <section className="intro" aria-labelledby="page-title">
      <p className="eyebrow">Plataforma de ocorrências urbanas</p>
      <h1 id="page-title">Tudo começa pelo que acontece na sua cidade.</h1>
      <p className="intro-copy">
        Estamos construindo um espaço para dar visibilidade aos problemas
        urbanos. Por enquanto, você pode verificar a conexão com o serviço.
      </p>
      <div className="mt-6 flex flex-wrap gap-4">
        <Link className="button button-primary" to="/status">Verificar serviço</Link>
      </div>
    </section>
  )
}

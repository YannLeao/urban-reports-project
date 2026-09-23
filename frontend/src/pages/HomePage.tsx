import { buttonStyles } from '../components/ui/button-styles'
import { Link } from 'react-router'

export function HomePage() {
  return (
    <section className="pt-12 pb-8 md:pt-16" aria-labelledby="page-title">
      <p className="mb-3 text-small font-bold text-brand-default">Plataforma de ocorrências urbanas</p>
      <h1 id="page-title">Tudo começa pelo que acontece na sua cidade.</h1>
      <p className="mb-0 text-lead text-text-secondary">
        Estamos construindo um espaço para dar visibilidade aos problemas
        urbanos. Crie sua conta para fazer parte do Alô Cidade.
      </p>
      <div className="mt-6 flex flex-wrap gap-4">
        <Link className={buttonStyles()} to="/cadastro">Criar conta</Link>
        <Link className={buttonStyles('secondary')} to="/entrar">Entrar</Link>
        <Link className={buttonStyles('secondary')} to="/status">Verificar serviço</Link>
      </div>
      <p><Link className={buttonStyles('quiet')} to="/prova-imagem">Demonstração técnica: teste de fotografia</Link></p>
    </section>
  )
}

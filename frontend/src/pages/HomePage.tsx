import { Link } from 'react-router'
import { buttonStyles } from '../components/ui/button-styles'
import { Icon } from '../components/ui/Icon'
import { useAuth } from '../features/auth/auth'
import { LogoutActions } from '../features/auth/LogoutActions'
import { CommunityMapPreview } from '../features/home/CommunityMapPreview'
import { OccurrencePin } from '../features/location/pins/OccurrencePin'

export function HomePage() {
  const { state } = useAuth()
  const role = state.status === 'authenticated' ? state.user.role : null
  return <div className="py-8 md:py-14">
    <section aria-labelledby="page-title" className="grid items-center gap-8 md:grid-cols-2 md:gap-12">
      <div>
        <p className="mb-5 flex items-center gap-2 text-small font-bold text-brand-default"><span className="size-2 rounded-pill bg-brand-default" aria-hidden="true" />Belo Jardim, Pernambuco</p>
        <h1 id="page-title" className="text-4xl leading-tight tracking-tight md:text-6xl">Sua rua merece <span className="text-brand-default">cuidado.</span></h1>
        <p className="mt-5 max-w-reading text-lead text-text-secondary">Um poste apagado. Lixo na esquina. Um problema na sua rua. Faça sua cidade ouvir você.</p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {role === 'SUPER_ADMIN' ? <LogoutActions /> : <Link className={buttonStyles()} to={role === 'ADMIN' ? '/administracao/relatos' : '/registrar-ocorrencia'}><Icon name={role === 'ADMIN' ? 'list' : 'plus'} />{role === 'ADMIN' ? 'Abrir moderação' : 'Relatar problema'}</Link>}
          <Link className={buttonStyles('secondary')} to="/ocorrencias"><Icon name="map" />Ver ocorrências</Link>
        </div>
        {role === 'USER' ? <Link to="/meus-relatos" className="mt-3 inline-flex min-h-target items-center gap-2 text-small font-bold"><Icon name="list" />Acompanhar meus relatos</Link> : <p className="mt-4 text-small text-text-secondary">Para consultar, é só entrar. Sem cadastro.</p>}
      </div>
      <CommunityMapPreview />
    </section>

    <section aria-labelledby="categories-title" className="py-12 md:py-20">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-2"><div><p className="mb-2 text-small font-bold text-brand-default">Olhe ao redor</p><h2 id="categories-title" className="mb-0">Cada problema tem seu lugar.</h2></div><Link to="/ocorrencias" className="inline-flex min-h-target items-center gap-1 font-bold">Explorar todos<Icon name="chevronRight" /></Link></div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {([{ id: 1, name: 'Iluminação', detail: 'Mais luz no caminho' }, { id: 3, name: 'Limpeza', detail: 'Espaços mais cuidados' }, { id: 7, name: 'Áreas verdes', detail: 'Verde que faz parte' }, { id: 2, name: 'Pavimentação', detail: 'Um caminho melhor' }] as const).map(item => <Link key={item.id} to={`/ocorrencias?categoria=${item.id}&visao=mapa`} className="group flex min-w-0 flex-col items-start rounded-card border border-border-subtle bg-surface-raised p-4 no-underline transition-colors hover:bg-surface-soft md:p-6"><OccurrencePin categoryId={item.id} size={40} /><h3 className="mb-1 mt-4 text-base font-bold text-text-primary">{item.name}</h3><span className="text-small text-text-secondary">{item.detail}</span></Link>)}
      </div>
    </section>

    <section className="rounded-card bg-surface-soft p-5 md:p-10" aria-labelledby="how-title">
      <div className="mb-8 max-w-reading"><p className="mb-2 text-small font-bold text-brand-default">Da sua rua ao acompanhamento</p><h2 id="how-title">Como funciona</h2><p className="mb-0 text-lead text-text-secondary">Você mostra. A equipe analisa. Você acompanha.</p></div>
      <ol className="m-0 grid list-none gap-4 p-0 md:grid-cols-3">
        {([
          { icon: 'camera', title: 'Registre', text: 'Fotos ou vídeo, local e uma breve descrição.' },
          { icon: 'list', title: 'A equipe analisa', text: 'Seu relato passa pela moderação antes de aparecer para a comunidade.' },
          { icon: 'bell', title: 'Acompanhe', text: 'Receba atualizações e veja cada etapa em Meus relatos.' },
        ] as const).map((item, index) => <li key={item.title} className="rounded-card border border-border-subtle bg-surface-raised p-5"><div className="mb-6 flex items-center justify-between"><span className="flex size-10 items-center justify-center rounded-pill bg-brand-accent font-bold" aria-hidden="true">0{index + 1}</span><Icon name={item.icon} className="text-brand-default" /></div><h3 className="mb-2 text-title">{item.title}</h3><p className="mb-0 text-text-secondary">{item.text}</p></li>)}
      </ol>
    </section>

    <section className="grid items-center gap-8 py-12 md:grid-cols-2 md:py-20" aria-labelledby="follow-title">
      <div className="rounded-card border border-border-subtle bg-surface-raised p-6 md:p-8"><p className="mb-6 text-small font-bold text-text-secondary">O caminho de um relato · Exemplo</p><ol className="m-0 grid list-none gap-5 border-l-2 border-brand-accent pl-5">{['Pendente: na fila de análise', 'Aceita: visível para a comunidade', 'Resolvida: solução registrada'].map((step, index) => <li key={step} className="flex items-center gap-3"><span className="flex size-8 shrink-0 items-center justify-center rounded-pill bg-brand-accent font-bold" aria-hidden="true">{index + 1}</span><span className="font-bold">{step}</span></li>)}</ol></div>
      <div><p className="mb-2 text-small font-bold text-brand-default">A cidade em movimento</p><h2 id="follow-title">Veja o que já mudou por aqui.</h2><p className="text-text-secondary">Consulte as ocorrências aceitas e descubra as que já foram resolvidas. Pelo mapa ou pela lista, sem precisar de conta.</p><Link className={buttonStyles('secondary')} to="/ocorrencias?estado=RESOLVED"><Icon name="check" />Ver resolvidas</Link></div>
    </section>

    <section aria-labelledby="questions-title" className="border-t border-border-subtle py-8 md:py-12"><h2 id="questions-title">Antes de começar</h2><div className="divide-y divide-border-subtle">{[
      ['Preciso de conta?', 'Para consultar ocorrências, não. Para registrar e acompanhar seus próprios relatos, crie uma conta.'],
      ['Quais relatos aparecem para todos?', 'Somente os aceitos pela moderação e os resolvidos. Pendentes e rejeitados ficam fora da consulta pública.'],
      ['Como acompanho meu relato?', 'Entre em Meus relatos para ver o status, o histórico e os comentários da equipe. As atualizações também chegam à sua central de notificações.'],
    ].map(([question, answer]) => <details key={question} className="py-2"><summary className="min-h-target cursor-pointer py-3 font-bold">{question}</summary><p className="max-w-reading pb-3 text-text-secondary">{answer}</p></details>)}</div></section>

    {role !== 'SUPER_ADMIN' && <section className="mt-4 rounded-card bg-brand-accent p-6 text-center md:p-12" aria-labelledby="start-title"><img src="/favicon.svg" alt="" width="48" height="48" className="mx-auto mb-4 size-12" /><h2 id="start-title">O próximo cuidado pode começar com você.</h2><p className="mb-6 text-text-secondary">Viu algo que precisa de atenção? Registre.</p><Link className={buttonStyles()} to="/registrar-ocorrencia"><Icon name="plus" />Fazer um relato</Link></section>}
  </div>
}

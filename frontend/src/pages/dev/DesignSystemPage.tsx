import { SimilarOccurrencesPanel } from '../../features/occurrence/SimilarOccurrencesReview'
import { PasswordField } from '../../components/ui/PasswordField'
import { OccurrenceStatus } from '../../features/occurrence/OccurrenceStatus'
import { PasswordRecoveryAccess, NotificationBell } from '../../app/ProductIntegrations'
import { Icon } from '../../components/ui/Icon'
import { OccurrencePin } from '../../features/location/pins/OccurrencePin'
import { categoryPins } from '../../features/location/pins/pin-variants'
import { LocationPicker } from '../../features/location/LocationPicker'
import type { GeographicPoint } from '../../features/location/point'
import { Dialog } from '../../components/ui/Dialog'
import { useRef, useState } from 'react'
import { ImagePicker } from '../../features/image/ImagePicker'
import { MediaPicker } from '../../features/image/MediaPicker'
import type { PhotoDraft } from '../../features/image/photo-draft'
import { Button } from '../../components/ui/Button'
import { Input, Select, Textarea } from '../../components/ui/Field'
import { Alert, StatusBadge } from '../../components/ui/Feedback'
import { Card } from '../../components/ui/Card'
import { OccurrenceHistory } from '../../features/occurrence/OccurrenceHistory'
import { CountDistribution } from '../../components/ui/CountDistribution'

export default function DesignSystemPage() {
  const [mediaMode, setMediaMode] = useState<'IMAGE' | 'VIDEO'>('IMAGE')
  const [photos, setPhotos] = useState<PhotoDraft[]>([])
  const [point, setPoint] = useState<GeographicPoint | null>(null)
  const [showMap, setShowMap] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)
  const [image, setImage] = useState<File | null>(null)
  const [imageDisabled, setImageDisabled] = useState(false)
  const [imageValidating, setImageValidating] = useState(false)
  return <>
    <section className="pt-12 pb-8 md:pt-16"><p className="mb-3 text-small font-bold text-brand-default">Referência de desenvolvimento</p>
      <h1>Design system Alô Cidade</h1><p className="mb-0 text-lead text-text-secondary">Exemplos demonstrativos. Nenhum dado é enviado ao serviço.</p></section>
    <div className="grid gap-8 pb-8">
      <Card><h2>Registro em quatro etapas</h2>
        <ol className="grid gap-2"><li>Foto ou vídeo — primeira seleção válida avança cadastro uma vez.</li><li>Localização — mapa e sugestão GPS confirmada.</li><li>Informações — categoria, título e detalhes opcionais.</li><li>Revisão — resumo e sugestões próximas, única confirmação final.</li></ol>
        <p>Etapas visitadas permanecem montadas, com foco no título/erro e estado preservado. Voltar não descarta. Sem entrada numérica de coordenadas ou autosave.</p>
      </Card>
      <Card><h2>Sugestões de relatos próximos</h2>
        <p>Revisão informativa antes do envio: até cinco ativos da mesma categoria em 100 m, sem mídia ou autoria. Exemplo estático sem consulta; ações abaixo são demonstrativas.</p>
        <SimilarOccurrencesPanel visible wizard busy={false} status="candidates" onReview={() => {}} onConfirm={() => {}} onRetry={() => {}}
          result={{ radiusMeters: 100, limit: 5, items: [{ id: '00000000-0000-4000-8000-000000000002', categoryId: 2,
            categoryName: 'Buraco ou pavimentação', title: 'Buraco na esquina (exemplo)', neighborhood: 'Centro', reference: 'Praça de exemplo',
            status: 'PENDING', createdAt: '2026-10-20T12:00:00Z', distanceMeters: 32.4 }] }} />
      </Card>
      <Card><h2>Fotos ou vídeo</h2>
        <p>Uma a cinco fotos ou um vídeo MP4. Troca de modo exige confirmação; seleção local sem upload.</p>
        <MediaPicker mode={mediaMode} onMode={setMediaMode} value={photos} onChange={setPhotos} onValidationChange={() => {}} />
      </Card>
      <Card><h2>Navegação e exploração</h2>
        <p>Ícone com rótulo visível; o shell adapta destinos ao papel. Controles compactos preservam o alvo de toque.</p>
        <div className="flex flex-wrap gap-4"><span className="inline-flex items-center gap-2"><Icon name="map" />Mapa</span><span className="inline-flex items-center gap-2"><Icon name="plus" />Relatar</span><Button size="compact" disabled>Atualizar</Button><NotificationBell unreadCount={3} /></div>
        <div className="mt-4"><PasswordRecoveryAccess /></div>
        <p className="mt-4 text-small">O sino ilustrativo mostra três notificações não lidas e aponta para a central privada. A recuperação de senha permanece indisponível. O resumo de seleção no mapa é não modal, com fechamento explícito e foto somente do relato escolhido.</p>
      </Card>
      <Card><h2>Notificação interna — exemplo</h2>
        <p>Seu relato “Poste apagado” foi rejeitado: a fotografia não corresponde ao local informado.</p>
        <p className="font-bold">Não lida</p>
        <Button variant="secondary" disabled>Marcar como lida — exemplo estático</Button>
        <p className="text-small text-text-secondary">Na central, a leitura atualiza a contagem do sino e preserva a mensagem.</p>
      </Card>
      <Card><h2>Cores e tipografia</h2><div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] gap-6">
        <div className="border border-border-control rounded-control p-4 bg-brand-default text-surface-raised">Marca · carvão</div>
        <div className="border border-border-control rounded-control p-4 bg-brand-accent text-text-primary">Destaque · pêssego</div>
        <div className="border border-border-control rounded-control p-4 bg-surface-canvas text-text-primary">Superfície · clara</div>
      </div><h3>A cidade é o conteúdo.</h3><p>A interface deve sair do caminho. Figtree: atenção, conexão, localização, ação.</p><small>Texto de apoio e orientações.</small></Card>
      <Card><h2>Seleção de fotografia</h2>
        <Button variant="secondary" onClick={() => setImageDisabled(value => !value)}>{imageDisabled ? 'Habilitar fotografia' : 'Simular envio: bloquear fotografia'}</Button>
        <p>{imageValidating ? 'O formulário aguarda a validação da fotografia.' : 'Sem validação pendente.'}</p>
        <ImagePicker value={image} onChange={setImage} disabled={imageDisabled} onValidationChange={setImageValidating} />
      </Card>
      <Card><h2>Pinos das ocorrências</h2>
        <div className="flex flex-wrap gap-5">{([1, 2, 3, 4, 5, 6, 7, 8] as const).map(categoryId => <figure key={categoryId} className="m-0 grid gap-2">
          <OccurrencePin categoryId={categoryId} label={`Categoria ${categoryId}: ${categoryPins[categoryId]}`} />
          <figcaption>{categoryId} · {categoryPins[categoryId]}</figcaption>
        </figure>)}</div>
        <p>Selecionado: contorno mais espesso; categoria e seleção têm significados distintos.</p>
        <OccurrencePin categoryId={8} selected label="Ocorrência selecionada" />
      </Card>
      <Card><h2>Localização geográfica</h2>
        <p>Exemplo sem API. Abrir o mapa consulta o provedor externo de tiles; o GPS só é solicitado pelo botão próprio.</p>
        <Button variant="secondary" onClick={() => setShowMap(value => !value)}>{showMap ? 'Ocultar seletor' : 'Abrir seletor de localização'}</Button>
        {showMap && <LocationPicker value={point} onChange={setPoint} />}
      </Card>
      <Card><h2>Botões</h2><div className="grid gap-8 pb-8">
        {(['primary', 'secondary', 'quiet'] as const).map(variant => <div key={variant} className="flex flex-wrap items-start gap-4">
          <Button variant={variant}>Ação {variant}</Button><Button variant={variant} className="outline-solid outline-[length:var(--ds-action-focus-width)] outline-action-focus-ring outline-offset-[var(--ds-action-focus-offset)]">Exemplo de foco</Button>
          <Button variant={variant} disabled>Indisponível</Button><Button variant={variant} loading>Salvando exemplo</Button>
        </div>)}
      </div></Card>
      <Card><h2>Campos</h2><div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] gap-6">
        <Input label="Nome do exemplo" description="Use um nome fácil de reconhecer." placeholder="Praça do bairro" />
        <Input label="Campo com erro" description="Exemplo demonstrativo de validação." error="Preencha o nome para continuar." required />
        <Input label="Campo indisponível" defaultValue="Disponível em outra etapa" disabled />
        <Input label="Campo com foco ilustrado" className="outline-solid outline-[length:var(--ds-action-focus-width)] outline-action-focus-ring outline-offset-[var(--ds-action-focus-offset)]" />
        <Select label="Opção demonstrativa" description="Seleção nativa do navegador." defaultValue=""><option value="">Selecione uma opção</option><option value="a">Opção de exemplo</option></Select>
        <Textarea label="Descrição demonstrativa" description="Não inclua dados pessoais neste exemplo." rows={4} />
      </div></Card>
      <Card><h2>Cadastro de cidadão</h2><div className="grid gap-5">
        <Input label="E-mail de exemplo" type="email" autoComplete="off" error="Este e-mail já está cadastrado." />
        <PasswordField label="Senha de exemplo" autoComplete="off" description="De 15 a 128 caracteres. Espaços e acentos são permitidos." />
        <Alert tone="success" role="note">Exemplo: conta criada. O cadastro não inicia uma sessão.</Alert>
        <Alert tone="warning" role="note">Exemplo de falha de rede: não conseguimos confirmar o resultado. A conta pode ter sido criada.</Alert>
      </div></Card>
      <Card><h2>Login e sessão</h2><div className="grid gap-5">
        <Input label="E-mail para entrar (exemplo)" type="email" autoComplete="off" />
        <PasswordField label="Senha para entrar (exemplo)" autoComplete="off" />
        <Button loading>Entrando…</Button>
        <Alert tone="danger" role="note">E-mail ou senha incorretos.</Alert>
        <Alert tone="warning" role="note">Não foi possível validar sua sessão. Confira sua conexão.</Alert>
        <Alert tone="warning" role="note">Não foi possível confirmar o encerramento da sessão. Tente sair novamente.</Alert>
      </div></Card>
      <Card><h2>Relatos pendentes</h2>
        <OccurrenceStatus status="PENDING" />
        <Textarea label="Detalhes (opcional) — exemplo" description="Se quiser, conte algo que a foto não mostra. Até 1000 caracteres." />
        <Button ref={trigger} variant="quiet" className="text-feedback-danger-foreground" onClick={() => { dialog.current?.showModal(); cancel.current?.focus() }}>Exemplo de confirmação de exclusão</Button>
        <Dialog ref={dialog} aria-labelledby="example-delete-title" onClose={() => trigger.current?.focus()} className="m-auto max-w-reading rounded-card border border-border-control bg-surface-raised p-6 text-text-primary backdrop:bg-text-primary/50">
          <h2 id="example-delete-title">Excluir relato</h2><p>Poste apagado na praça (exemplo)</p><p>Esta ação não pode ser desfeita.</p>
          <Button ref={cancel} variant="secondary" onClick={() => dialog.current?.close()}>Cancelar</Button>
          <Button variant="quiet" className="text-feedback-danger-foreground" onClick={() => dialog.current?.close()}>Excluir exemplo</Button>
        </Dialog>
      </Card>
      <Card><h2>Estados e acompanhamento do relato</h2>
        <div className="flex flex-wrap gap-3">
          <OccurrenceStatus status="PENDING" /><OccurrenceStatus status="IN_ANALYSIS" />
          <OccurrenceStatus status="RESOLVED" /><OccurrenceStatus status="REJECTED" />
        </div>
        <OccurrenceHistory events={[{ id: '3e85aa3d-19e3-42a3-8861-c435ff5908af', previousStatus: 'PENDING', newStatus: 'REJECTED', occurredAt: '2026-10-15T12:00:00Z', responsible: 'Moderação', reason: 'Exemplo: fotografia não corresponde ao local informado.' }]} />
      </Card>
      <Card><h2>Contas administrativas e rejeição</h2>
        <p>Exemplos de situação: Aguardando ativação · Ativo · Desativado.</p>
        <Alert tone="info" role="note">Convite aceito pelo servidor de e-mail. Isso não confirma o recebimento.</Alert>
        <Alert tone="danger" role="note" className="mt-4">Conta aguardando ativação. O envio do convite falhou. Reenvie quando o serviço estiver disponível.</Alert>
        <Textarea className="mt-4" label="Justificativa de rejeição — exemplo" description="De 10 a 500 caracteres após remover espaços externos. 9/500 caracteres." defaultValue="Inválido!" error="Informe uma justificativa de 10 a 500 caracteres." />
      </Card>
      <Card><h2>Distribuição de relatos — exemplo</h2>
        <CountDistribution total={6} items={[{ key: 'pending', label: 'Pendente', count: 1 }, { key: 'resolved', label: 'Resolvida', count: 5 }, { key: 'rejected', label: 'Rejeitada', count: 0 }]} />
        <Alert tone="warning" role="note" className="mt-4">Exemplo: média parcial. 1 resolvida considerada; 1 sem duração válida.</Alert>
        <p>Sem amostra: Sem dados. Duração zero válida: 0 segundos.</p>
      </Card>
      <Card><h2>Feedback textual</h2><div className="grid gap-8 pb-8">
        {(['success', 'warning', 'danger', 'info'] as const).map(tone => <div key={tone}><StatusBadge tone={tone} label={`Exemplo ${tone}`} /><Alert tone={tone} role="note" className="mt-4">Mensagem demonstrativa: o texto explica a situação e orienta o próximo passo.</Alert></div>)}
      </div></Card>
    </div>
  </>
}

import { useState } from 'react'
import { ImagePicker } from '../../features/image/ImagePicker'
import { Button } from '../../components/ui/Button'
import { Input, Select, Textarea } from '../../components/ui/Field'
import { Alert, StatusBadge } from '../../components/ui/Feedback'
import { Card } from '../../components/ui/Card'

export default function DesignSystemPage() {
  const [image, setImage] = useState<File | null>(null)
  return <>
    <section className="pt-12 pb-8 md:pt-16"><p className="mb-3 text-small font-bold text-brand-default">Referência de desenvolvimento</p>
      <h1>Design system Alô Cidade</h1><p className="mb-0 text-lead text-text-secondary">Exemplos demonstrativos. Nenhum dado é enviado ao serviço.</p></section>
    <div className="grid gap-8 pb-8">
      <Card><h2>Cores e tipografia</h2><div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] gap-6">
        <div className="border border-border-control rounded-control p-4 bg-brand-default text-surface-raised">Marca · petróleo</div>
        <div className="border border-border-control rounded-control p-4 bg-brand-accent text-text-primary">Ação · coral</div>
        <div className="border border-border-control rounded-control p-4 bg-surface-canvas text-text-primary">Superfície · clara</div>
      </div><h3>A cidade é o conteúdo.</h3><p>A interface deve sair do caminho. Manrope: atenção, conexão, localização, ação.</p><small>Texto de apoio e orientações.</small></Card>
      <Card><h2>Seleção de fotografia</h2><ImagePicker value={image} onChange={setImage} /></Card>
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
      <Card><h2>Feedback textual</h2><div className="grid gap-8 pb-8">
        {(['success', 'warning', 'danger', 'info'] as const).map(tone => <div key={tone}><StatusBadge tone={tone} label={`Exemplo ${tone}`} /><Alert tone={tone} role="note" className="mt-4">Mensagem demonstrativa: o texto explica a situação e orienta o próximo passo.</Alert></div>)}
      </div></Card>
    </div>
  </>
}

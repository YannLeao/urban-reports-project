# Componentes compartilhados

Implementação em `frontend/src/components/ui/`. Veja estados e combinações em
`/dev/design-system` com `pnpm dev`. A referência é demonstrativa, sem API.

## Button

```tsx
<Button onClick={retry}>Tentar novamente</Button>
<Button variant="secondary" disabled>Indisponível</Button>
<Button variant="quiet">Ação auxiliar</Button>
<Button type="submit" loading={saving}>Salvar</Button>
```

`variant`: `primary` (padrão), `secondary`, `quiet`. `loading`: desabilita o
acionamento, define `aria-busy`, acrescenta símbolo decorativo e mantém o nome
acessível dos children. Preserva props/ref de button React 19. O padrão é
`type="button"`; declare submit quando houver formulário. `disabled` usa a
semântica nativa, impedindo mouse/teclado. Todos os estados têm tokens de pares
texto/fundo, com foco comum. Use rótulos de ação, sem botão sem destino.
Para navegação, use `Link` com `className={buttonStyles()}` ou
`buttonStyles('secondary')` / `buttonStyles('quiet')`, importado de
`frontend/src/components/ui/button-styles.ts`. Nunca aninhe button em link.
Button e links compartilham os mesmos utilitários/variantes. Uma ação principal
por contexto.

## Field, Input, Textarea e Select

```tsx
<Input label="Título" name="title" description="Descreva o local brevemente."
  error={error} required value={title} onChange={onTitleChange} />
<Textarea label="Descrição" name="description" rows={4} />
<Select label="Opção" name="option" defaultValue="">
  <option value="">Selecione</option><option value="example">Exemplo</option>
</Select>
```

Wrappers aceitam props/ref nativas, `label` obrigatório, `description` e `error`
textuais opcionais. `Field` gera ID estável por instância ou respeita `id`; associa
label, descrição, erro e IDs externos de `aria-describedby`. Erro define
`aria-invalid=true`; sem erro preserva um `aria-invalid` externo. `Field` isolado
aceita children como função que recebe os atributos de associação do controle.
Não omita esses atributos ao criar outro wrapper.

`Select` é nativo; Textarea permite redimensionamento vertical. Formulários podem
usar APIs nativas, valores controlados ou não controlados. Não há biblioteca de
formulário, validação de domínio ou envio embutidos. O consumidor decide quando
exibir erro, como focar o primeiro campo inválido e como anunciar falhas de envio.

## Alert, StatusBadge e Card

```tsx
<Alert tone="warning" role="alert">Não conseguimos verificar a conexão.</Alert>
<StatusBadge tone="success" label="Conexão confirmada" />
<Card aria-labelledby="section-title"><h2 id="section-title">Conexão</h2></Card>
```

`Alert` aceita `tone=info|success|warning|danger` e props de div. Padrão `info`,
`role=status`; use `role=alert` para falha dinâmica relevante e `role=note` para
exemplos estáticos. Não inclui título, ação ou ícone automaticamente.
`StatusBadge` exige `label` textual não vazio; não passe só ícone ou código de API.
O símbolo interno é decorativo, e tone não infere estado de domínio. `Card` é
section simples com props nativas; nomeie a seção por heading/aria-labelledby.
Consumidores atuais: status e referência visual. Não empilhar cards sem motivo.

Bottom sheet e controles de mapa não estão implementados. Cartões de relatos
privados usam foto 4:3 com corte na lista e imagem inteira no detalhe. Exclusão
usa dialog nativo modal com foco inicial em Cancelar, Escape, retorno de foco
e bloqueio durante envio. Antes de criá-los, definir comportamento de teclado, entrada e
retorno de foco, Escape, semântica e necessidades reais. Não simular modal com
uma div posicionada sobre a tela.

## Seleção de fotografia

`ImagePicker` em `frontend/src/features/image/` compõe Button e Alert, sem
acoplar o design system à API. Usa `value: File | null` e `onChange`, uma prévia
inteira com `object-fit: contain`, nome com quebra de linha e controles de arquivo,
câmera e remoção. Está demonstrado no catálogo dev e em `/prova-imagem`.

Durante a leitura, anuncia “Verificando imagem…” e bloqueia novas escolhas;
remoção cancela a leitura. Erro textual preserva a seleção anterior; remover
retorna o foco ao seletor. Os dois inputs possuem nomes e orientação associados.
Não há drag-and-drop obrigatório, corte, compressão ou envio. Veja os
[limites e roteiro de câmera](../image-selection-proof.md).

## Cadastro

`/cadastro` compõe Input/Field, Button e Alert com foco no primeiro erro ou
resumo; sucesso foca o título “Conta criada”. O catálogo ilustra erro de e-mail,
orientação de senha, sucesso sem sessão e incerteza de rede, sem enviar dados.
Contrato e limpeza de senhas estão em [identidade](../identity.md).

## Login e minha conta

`/entrar` reutiliza Input (e-mail/current-password), Button com loading e Alert
com foco no erro genérico. Cadastro concluído oferece login sem senha em navegação.
`/minha-conta` tem nome/e-mail e Sair; sem edição ou painel fictício. Bootstrap
mostra estado de validação, falha oferece Tentar novamente e logout incerto
preserva a tela com mensagem e retry. Não apresentar recuperação sem rota real.

O ImagePicker aceita também `disabled?: boolean` para bloquear todos os controles
e `onValidationChange?: (validating: boolean) => void` para notificar o consumidor
sincronamente no início/fim da validação e na invalidação de leituras. Os props
são opcionais e preservam a prova técnica. O formulário usa essa notificação
para bloquear submit durante troca de foto e disabled durante upload.

## Dialog de confirmação

`Dialog` preserva props/ref nativas de dialog. O consumidor abre com showModal,
foca Cancelar, fecha com close e devolve foco ao acionador em onClose. Modal
nativo torna o fundo inerte; o componente mantém Tab/Shift+Tab nos controles
visíveis habilitados. Escape usa comportamento nativo, bloqueado em envio.
A referência dev demonstra confirmação sem request. A tela real identifica o
relato pelo título, avisa irreversibilidade e usa ação destrutiva auxiliar.

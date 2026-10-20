# Componentes compartilhados

## Distribuições administrativas

`CountDistribution` recebe items `{key,label,count}` e total. Lista nativa exibe
rótulo e contagem textual, com barras decorativas proporcionais ocultas da árvore
acessível. Largura percentual é estilo dinâmico de dado; cores/espaçamento usam
tokens Tailwind existentes. Total zero mantém barras zeradas, sem divisão por
zero. O catálogo dev demonstra zeros e aviso de média parcial.
O [relatório](../occurrence-report.md) compõe Card/Button/Alert e tabela nativa
com caption e cabeçalhos para todas as localidades. Sem biblioteca de gráficos.
Métricas null mostram “Sem dados”; zero real permanece numérico.

O detalhe privado usa `OccurrenceHistory`: lista cronológica com estado anterior
e novo, horário em elemento time, responsável funcional “Moderação” e
justificativa em texto com quebras preservadas. Sem eventos, informa ausência de
mudanças sem fabricar criação retroativa. Os quatro estados têm rótulos textuais;
cor não substitui identificação. O catálogo dev inclui uma rejeição demonstrativa.

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
Button e links compartilham os mesmos utilitários/variantes. `size="compact"`
reduz somente padding horizontal, mantendo o alvo mínimo; links usam o terceiro
argumento de `buttonStyles(variant, className, 'compact')`. Uma ação principal
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
Consumidores incluem formulários, consultas, ferramentas dev e referência visual. Não empilhar cards sem motivo.

O mapa de consulta usa resumo não modal no próprio quadro, sem gesto obrigatório;
o seletor básico de mapa está descrito abaixo. Cartões de relatos
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
preserva a tela com mensagem e retry. O acesso de recuperação ainda não tem rota: apresenta “Recuperação de senha
em breve”, sem link ou envio simulado; ver ProductIntegrations.tsx.

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

## Provisionamento e moderação

Gestão administrativa reutiliza Input/Button/Alert/Card e o Dialog nativo:
confirmar desativação identifica a conta, foca Cancelar e devolve o foco ao
acionador em Escape/cancelamento. Estados de conta têm texto explícito
(Aguardando ativação/Ativo/Desativado); aceite da API de e-mail não é rótulo de entrega.
Ativação usa os campos de senha existentes, erro com foco e sucesso sem login
automático. Rejeição usa Textarea com contador de pontos de código após trim,
foco ao abrir e confirmação bloqueada durante envio. Não limitar por maxLength
HTML, que contaria unidades UTF-16. Foto e conteúdo precedem ações e histórico.

## Localização confirmada

`features/location/LocationPicker` compõe mapa, resumo textual, Input/Button e
GPS opt-in. Clique confirma; coordenadas digitadas ou sugeridas exigem botão de
confirmação. O catálogo oferece abertura explícita para não consultar terceiros
antes da ação. Texto de erro associa Latitude e recebe foco pelo formulário.
Sem tiles, a alternativa textual continua disponível. O mapa permite teclado,
zoom por controles e preserva rolagem por roda; sua altura responde ao layout.

Leaflet fornece CSS próprio carregado sob demanda: exceção de integração de
biblioteca, necessária aos panes/controles/tiles. Classes Tailwind permanecem no
layout e estados da aplicação. O marcador do formulário vem do pacote Leaflet. Nas consultas, os SVGs fornecidos
foram convertidos para os pinos canônicos descritos abaixo.
Contrato e acessibilidade: [localização](../occurrence-location.md).

## Pinos de ocorrências e consultas

`features/location/pins/OccurrencePin.tsx` é a fonte canônica dos desenhos 64×76,
convertidos dos sete SVGs fornecidos, sem redesenho. Recebe categoryId, selected,
size e label; sem label é decorativo, com label usa título/ID único. Os mesmos
componentes aparecem no catálogo e no DivIcon Leaflet, sem SVG de docs em runtime.
Cores são variáveis semânticas do tema; selecionado usa contorno mais espesso e
resumo/aria-pressed, preservando a categoria. Genérico corresponde aos IDs5/6/8;
a seleção não representa status nem categoria. Tabela completa, adaptador, tamanho/
âncora, agrupamento, acessibilidade e política de ausência estão no
[guia de mapas](../occurrence-maps.md).

## Campo de senha na referência

O preview representa botão `type="button"` associado por `aria-controls` ao campo,
com nome e texto “Mostrar senha”/“Ocultar senha”. Alternar `password`/`text`
preserva valor e foco no acionador, inclusive na confirmação, sem submit.
Orientação: 15–128 pontos de código Unicode, espaços aceitos, sem mistura
obrigatória de maiúsculas/números/símbolos; sem trim/normalização. Confirmação
não pertence à API. Veja [identidade](../identity.md). A revisão geral dos
formulários reais fica para a auditoria de UI/UX.

As janelas do preview são exemplos abertos (`dialog open`, não modais): ficam
após o contexto em todas as larguras. Não simulam fluxo de API.
O componente Dialog da aplicação mantém seu contrato modal próprio.

Na rejeição demonstrativa, o contador usa pontos de código após o mesmo trim
ASCII do contrato; confirmar fica disponível entre 10 e 500. Trocar motivo não
modifica a explicação. A confirmação anuncia somente a validação do exemplo.

## PasswordField

`components/ui/PasswordField` aceita as mesmas props/ref de `Input`, exceto
`type`, que pertence ao componente. Reutiliza `Field`: `label`, descrição,
erro, ID e `aria-describedby` continuam associados ao input. Cada instância
mantém sua própria visibilidade; o botão de 44 px alterna “Mostrar senha” e
“Ocultar senha”, sem submit, alteração de valor ou revelação da confirmação.
O ref aponta para o input e o foco permanece no controle acionado.

```tsx
<PasswordField ref={passwordInput} label="Senha" name="password"
  autoComplete="new-password" value={password} onChange={onPasswordChange}
  description="De 15 a 128 caracteres. Espaços e acentos são permitidos."
  error={errors.password} disabled={pending} required />
```

Use `current-password` no login e `new-password` na criação/redefinição e
confirmação. O componente não valida, persiste ou envia senha. O consumidor
preserva a política Unicode atual e limpa segredos conforme o fluxo. A futura
recuperação deve consumir este componente sem duplicar seu controle visual.

## OccurrenceStatus e composições de relato

`features/occurrence/OccurrenceStatus` recebe `status: Occurrence['status']`,
validado pelo schema de fronteira. Usa os pares canônicos `report.pending`,
`report.analysis`, `report.resolved` e `report.rejected`, com texto e símbolo
decorativo distintos. Não use `StatusBadge` genérico para estado de relato.
Estado não muda categoria/aparência dos pinos e não indica progresso percentual.

Cards de lista usam fotografia com largura integral e conteúdo com padding
local, sem Card dentro de Card. Título é link; o artigo não é clicável.
`OccurrencePhoto` e `PublicOccurrencePhoto` aceitam `flush` para retirar a margem
externa em cards/linhas. `full` continua preservando a imagem inteira e
`thumbnail` continua restrito aos resumos sob demanda da exploração.

`Card density="compact"` usa padding menor em linhas de painéis. O padrão
continua com o espaçamento anterior; não tente sobrescrevê-lo com classes de
padding conflitantes. Veja [composição dos percursos](../frontend-report-experience.md).

## Notificações

O sino é Link com Icon bell, alvo mínimo e badge em brand-accent/text-primary;
o nome acessível inclui a contagem completa, mesmo quando o badge mostra 99+.
A central usa Card e estado textual Lida/Não lida, Button para leitura e paginação,
Alert para falhas e Link para o relato. Não interpretar HTML das mensagens.
A composição é coberta por NotificationsPage.test.tsx; não há novo componente base.

### Coleção de fotografias

`PhotoCollectionPicker` reutiliza Button/Alert e tokens existentes para contador, prévias, remoção e reordenação acessível. Primeira foto é capa. `OccurrenceGallery` mantém foto inteira, posição e botões anterior/próxima apenas quando há múltiplas. Cards/mapas mantêm composição e capa original, sem baixar coleção inteira. Não gera thumbnails. [Contrato](../multiple-photos.md).


### Fotos ou vídeo

`MediaPicker` compõe `PhotoCollectionPicker` e seleção única MP4. Botões Fotos/Vídeo
usam aria-pressed e diálogo nativo de confirmação antes de limpar mídia escolhida.
Cancelar preserva rascunho; a persistência só muda com sucesso do envio. Limites e
recusa de MOV/HEVC ficam visíveis junto ao campo. Não há etapa de Wizard nova.

`VideoPlaceholder` usa Icon/play, tokens existentes e duração textual, sem poster
nem GET automático. `OccurrenceVideo` oferece Carregar vídeo e player responsivo
com controls/playsinline/preload=none, sem autoplay; privado informa download
integral antes de tocar. Erro oferece nova tentativa. Catálogo DEV demonstra o
seletor exclusivo; [contrato e roteiro](../occurrence-video.md).

## Revisão de relatos próximos

`SimilarOccurrencesPanel` apresenta carregamento, sugestões textuais sem mídia,
vazio, falha, autorização negada e consulta não executada. Usa botões existentes,
status textual, lista com quebra de linhas e links de detalhe em nova aba com aviso.
Foco inicial no painel ao abrir/reabrir, sem novo foco por chegada de resposta.
`SimilarOccurrencesReview` conecta o hook autenticado; o catálogo usa o painel
puro com fixture sintética, sem request. [Contrato e roteiro](../similar-occurrences.md).

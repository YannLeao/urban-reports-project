# Mapas nas consultas e nos detalhes

A #44 complementa a [localização confirmada da #43](occurrence-location.md).
`/ocorrencias?visao=mapa` funciona anonimamente, sem depender de GPS.
“Minha localização” oferece uma consulta opcional, somente após ação explícita. Em
`/meus-relatos?visao=mapa`, a sessão determina o universo próprio. Os detalhes
público e do autor mostram a posição individual após a fotografia/conteúdo,
ou “Localização no mapa não informada”. As consultas e detalhes não editam pontos;
isso continua restrito ao formulário autorizado de Pendente.

## Contrato completo de marcadores

`GET /api/public/occurrences/markers` e `GET /api/occurrences/markers` retornam:

```json
{
  "items": [
    {
      "id": "b50062d3-9ac2-4e70-86fa-000000000001",
      "categoryId": 1,
      "categoryName": "Iluminação pública",
      "title": "Poste apagado na praça",
      "status": "PENDING",
      "latitude": -23.550520123456,
      "longitude": -46.633308987654
    }
  ],
  "total": 2,
  "located": 1,
  "unlocated": 1
}
```

- `total`: todos os relatos elegíveis naquele universo, com ou sem posição.
- `located`: quantidade com posição; coincide exatamente com `items.length`.
- `unlocated`: elegíveis sem posição; `total = located + unlocated`.
- `items`: **todos** os pontos elegíveis, independentemente da página dos cards.
  Não há paginação, limite oculto, truncamento ou filtro por viewport nesta versão.
  Ordem: createdAt DESC, id DESC. IDs são únicos. O frontend recusa resposta
  parcial/inconsistente e categorias fora do contrato 1–8, sem mostrar total falso.

Uma única instrução SELECT projeta só os campos cartográficos, incluindo linhas
legadas internamente para calcular contagens. A aplicação filtra os pares nulos
antes de serializar `items`; não carrega entidades completas, imagens, descrição,
histórico ou identidade. Marcadores e totais refletem o mesmo snapshot da
instrução PostgreSQL, sem joins com histórico que multipliquem ocorrências.
Cada nova requisição pode observar inserções, exclusões ou moderação posteriores;
não existe snapshot durável entre respostas/lista/detalhe.

O público usa exatamente `status <> REJECTED`, como lista/detalhe/foto; contagens
não incluem rejeitados. O privado filtra `author_id` extraído da sessão revogável,
incluindo os quatro estados do autor. `userId` de query não concede acesso.
Respostas usam `Cache-Control: no-store`; público não contém vínculo do autor,
e-mail, versão, storage ou auditoria. Não há mudança na precisão pública:
WGS84 em graus decimais e eixos nomeados, sem arredondamento adicional. A borda
Leaflet converte explicitamente para `[latitude, longitude]`, sem GeoJSON.

Relatos legados sem ponto permanecem acessíveis pela lista. Quando existem pontos,
o mapa mostra aviso contextual com a contagem integral sem localização; não a
deduz dos 20 cards atuais. Se nenhum relato tiver ponto, informa essa ausência
com caminho à lista. Nenhum ponto
usa centro de bairro, centro configurado ou zero como ausência. Zero é válido.
Zero relatos, nenhum ponto e erro de consulta são estados distintos.

### Volume e limites operacionais

A decisão do [ADR 0019](adr/0019-consultar-marcadores-completos.md) atende ao
volume acadêmico atual sem paginação artificial ou infraestrutura espacial.
Não há medição de tráfego/volume de produção que justifique um limite arbitrário.
Custo é O(n) de projeções em banco/resposta e n elementos na alternativa textual;
centenas de pontos exigem dezenas/centenas de KB conforme os títulos. Não há
promessa de escala ilimitada. Antes de crescer materialmente, medir tamanho,
latência/memória e adotar contrato de área/cursor com acesso completo e metadados
claros. Não introduzir corte silencioso ou alegar “todos” sobre uma amostra.

## Mapa compartilhado e pinos canônicos

`features/location/MapCanvas.tsx` concentra a integração da #43: importação
dinâmica de Leaflet/CSS, configuração validada, tiles, atribuição, falhas/retry,
ResizeObserver e controles. `LocationMap` mantém o seletor do formulário.
`OccurrenceMap` acrescenta pinos somente de leitura, enquadramento inicial,
agrupamento visual e reenquadramento explícito. Não há segunda configuração ou
provedor. O adaptador de ícones React/HTML carrega sob demanda; sem uma raiz React
por marcador, e layers/listeners são removidos ao desmontar/recarregar o mapa.

Fonte canônica executável: `frontend/src/features/location/pins/OccurrencePin.tsx`.
Os sete SVGs fornecidos foram convertidos, preservando `viewBox="0 0 64 76"`,
paths/círculos, proporção e símbolos. Não são carregados de docs/ em runtime e não
há cópia SVG manual mantida como segunda fonte. Os testes registram fingerprints
geométricos derivados dos originais. Prévia atual: `/dev/design-system`, seção
“Pinos das ocorrências”. O catálogo é apenas desenvolvimento.

| ID | Categoria vigente | Variante |
| --- | --- | --- |
| 1 | Iluminação pública | iluminacao |
| 2 | Buraco ou pavimentação | buraco |
| 3 | Lixo ou descarte irregular | limpeza |
| 4 | Saneamento ou alagamento | saneamento |
| 5 | Calçada ou acessibilidade | generico |
| 6 | Sinalização ou trânsito | generico |
| 7 | Árvore ou área verde | arborizacao |
| 8 | Outro | generico |

`categoryIdSchema` é a união do contrato vigente; `categoryPins` é mapeamento
exaustivo tipado. Genérico é uma escolha visual para 5/6/8, não aceitação de
categoria desconhecida. Evoluir categorias exige atualizar contrato/mapa/testes
juntos. `OccurrencePin` recebe categoryId, selected, size e label opcional.
Selecionado não é categoria, estado ou permissão: preserva o símbolo da categoria
com contorno de quatro unidades em vez de duas; o genérico selecionado preserva
o círculo branco do SVG específico. Resumo e `aria-pressed` reforçam a seleção.

Cores do SVG usam `--ds-brand-default`, `--ds-brand-deep`, `--ds-brand-accent` e
`--ds-surface-raised`, sem duplicar os valores dos tokens. SVG inline do DivIcon
herda o tema da página. Tamanho padrão 48×57 CSS px, âncora Leaflet `[24,55]`,
coerente com a ponta do desenho original próxima de (32,73). A geometria não foi
esticada nem redesenhada. `label` usa useId para título único; no mapa o SVG é
decorativo (`aria-hidden`) e o marcador recebe nome textual útil. Não há IDs
fixos compartilhados ou defs/gradientes.

`pins/pin-icon.tsx` usa renderToStaticMarkup sobre o componente canônico e o
contador numérico. Texto de relato não entra no HTML do DivIcon: nomes de
marcadores usam atributos DOM/Leaflet, e grupo/resumo/links são React. Não se
interpola título, bairro, descrição ou referência como HTML/SVG.

## Sobreposição, contexto e atualização

Agrupamento em pixels projetados no zoom atual aproxima pontos a menos de 64 px,
considerando células vizinhas. Recalcula ao mudar zoom ou conjunto de dados; não
é cluster geográfico persistido. O grupo mostra sua contagem e abre uma lista de
todos os relatos representados. Pontos idênticos continuam selecionáveis mesmo
no zoom máximo. A alternativa textual permite selecionar/abrir **todos os
localizados**, incluindo os que não aparecem na página de cards.

A URL mantém `visao=mapa`, página pública `pagina`, `selecionado`, `lat`, `lng` e
`zoom` do enquadramento explorado. Alternar para Lista preserva contexto. Os links
de detalhe guardam o retorno à consulta correspondente; back/links mantêm universo,
modo, página e seleção. Edição/cancelamento e exclusão conservam o retorno; excluir
retira a seleção do relato removido. Coordenadas de viewport na URL são apenas
navegação, não alteram relatos, e podem aparecer no histórico local do navegador.

O enquadramento prioriza viewport válida da URL; sem ela, usa os pontos ao montar
ou Belo Jardim/PE (centro/zoom do JSON) se não houver pontos. Atualização/seleção
não recentralizam a exploração; “Reenquadrar relatos” é explícito. Viewport salvo não é filtro de abrangência: todos os pontos
continuam carregados, e grupos/alternativa textual permitem alcançá-los.

Não há polling. “Atualizar mapa” renova o conjunto; falha mantém dados anteriores
com indicação de desatualização. Cadastro/edição/exclusão invalidam mapas públicos
e próprios pertinentes; moderação já invalida prefixos compartilhados. Cada
universo tem hook/cache separado: público `['public','occurrences','markers']`,
privado `['private',userId,'occurrences','markers']`. AuthProvider cancela/limpa o
prefixo privado no logout/401/troca de identidade; não persiste esses dados.
A navegação a um detalhe selecionado refaz sua leitura. Se já não for público,
404 esconde o conteúdo, invalida marcadores e remove seleção do caminho de retorno.

Na consulta, selecionar um relato abre um cartão não modal no mesmo quadro do
mapa: estado, título, foto sob demanda e “Ver relato”. O quadro divide espaço
entre mapa e resumo, preservando atribuição e controles. Fechamento explícito
retorna ao acionador quando disponível; seleção por lista também revela o quadro.
Grupo de pontos abre uma lista com rolagem e acesso a todos os relatos, sem foto
por item. Somente o relato escolhido consulta detalhe e fotografia, com schema e
endpoint do universo público/próprio. 404 remove seleção, informa indisponibilidade
e renova marcadores. Falha de foto preserva o link e texto; falha do detalhe tem retry.

Bearer pertence ao cliente privado da API; tiles/configuração/público usam fetch
sem credencial da sessão. “Minha localização” usa getCurrentPosition apenas no
clique, em contexto seguro; nunca watchPosition. A resposta válida centraliza a
exploração, sem editar relato, confirmar ponto do formulário ou persistir posição
no backend. Recusa, timeout, falta de suporte e resposta inválida preservam o
mapa/seleção. Resposta após desmontagem é ignorada. Não há indicador pessoal
persistente nem rastreamento. O centro explorado continua registrado na URL como
as outras navegações: pode aparecer no histórico do navegador e o provedor de
tiles recebe a área consultada. A precisão do aparelho não é garantida.

## Acessibilidade e falhas

Controles usam Link/Button nativos, foco visível e tamanhos de toque existentes.
Pinos usam teclado Enter; grupos e alternativa textual expõem botões/links nativos,
sem depender apenas de cor, SVG ou zoom. Não há armadilha de foco no mapa.
Atribuição permanece visível; roda continua rolando a página em vez de capturar
zoom. Nas consultas a altura usa viewport útil com fallback vh/svh e mínimo que permite
rolagem em tela baixa/zoom. Detalhes e seletor mantêm mapa compacto. Layout usa
utilitários/tokens; ResizeObserver acompanha o redimensionamento.

Rede de dados, importação dos pinos, Leaflet/CSS e tiles têm mensagem e retry
próprio. Falha de importação/configuração oferece recarga explícita da página,
preservando o contexto na URL: imports com falha podem ficar retidos no cache de
módulos do navegador, então repetir a mesma Promise não garante recuperação.
Falha de tiles usa retry local sem recarregar. A recarga das consultas refaz os
dados/sessão; sessão apenas em memória (sessionStorage indisponível) precisa de
novo login, conforme o contrato de autenticação. O formulário não é recarregado
por esse botão e mantém foto/rascunho, com alternativa textual para coordenadas.
Lista e restante do detalhe continuam utilizáveis. Legado não usa a
mensagem de falha de tiles. Mapa com zero pontos ainda usa o enquadramento
configurado, acompanhado da indicação textual de ausência.

O provedor e sua política são os da #43, sem chave nova, nova dependência ou
variável VITE. OpenStreetMap Standard não oferece SLA/capacidade ilimitada.
Manter atribuição, Referer e cache HTTP, sem prefetch/offline/varredura. Reavaliar
provedor/capacidade antes de aumentar uso. Nenhuma consulta cria seed de produção.

## Integração, execução e teste manual

A #43 precisa estar integrada (colunas V9, DTOs e confirmação do ponto). Esta
entrega não cria migration ou altera as regras de escrita. Publicar backend com
os endpoints aditivos de marcadores antes do frontend #44. Frontend anterior
continua usando listas/formulário; novo frontend contra API antiga falha no mapa
sem impedir a lista. Seguir deploys manuais GitLab/Render/Vercel já configurados;
não habilitar integração Git paralela. Implementação local não comprova deploy.

Pré-requisitos/variáveis sem segredos: JDK21, Docker, Node22.23.2/pnpm10.34.5;
DB_HOST/DB_PORT/DB_NAME/DB_USERNAME/DB_PASSWORD ou DB_URL e as cinco AUTH_JWT_*
externas de [segurança](security.md). Storage real exige as variáveis IMAGE_STORAGE_*
de [imagens](image-storage.md). Frontend usa VITE_API_URL pública (rebuild se mudar)
e `public/map-config.json`. Copiar exemplos locais conforme README, sem usar
placeholders em produção. Na raiz, iniciar só o banco: `docker compose up -d db`.

Em backend/, com JAVA_HOME21 e configuração local:
`./mvnw spring-boot:run -Dspring-boot.run.profiles=dev`.
Em frontend/: `pnpm install --frozen-lockfile` e `pnpm run dev`.
URLs locais usuais: http://localhost:5173/ocorrencias?visao=mapa e
http://localhost:5173/meus-relatos?visao=mapa. Autenticar apenas para o universo
próprio; a consulta pública não exige GPS/login. GPS só é solicitado pelo controle
“Minha localização”; testar aceitar, recusar e indisponibilidade.

1. Abrir público sem login e recarregar direto na URL do mapa. Conferir aviso de
   relatos sem ponto, mapa vazio em Belo Jardim (-8.336, -36.424), zoom 14,
   atribuição, categorias diferentes e seleção com resumo/link seguro ao detalhe.
2. Abrir detalhe e voltar: preservar modo, página/viewport e seleção. Conferir
   mapa individual e ausência de ação para mover o ponto; foto continua primeiro.
3. Na base descartável de testes, mais de 50 relatos devem produzir conjunto
   completo independente dos 20 cards públicos. Conferir que legado incrementa
   sem localização e continua acessível na lista. Não criar seed automático.
4. Coordenadas iguais: grupo apresenta contagem real, todos os relatos podem ser
   selecionados pela lista do grupo ou alternativa textual, inclusive por teclado.
5. Bloquear tiles no DevTools: erro/retry, lista textual/cards e detalhe funcionam.
   Falhar refresh da API: pontos anteriores persistem com aviso; recuperar e
   atualizar. Não automatizar pan/zoom para baixar tiles OSM.
6. Com duas contas reais de teste, conferir mapa próprio isolado, logout e nova
   sessão. Como ADMIN, rejeitar um ponto e atualizar público: ele deixa de aparecer
   e não integra totais. Detalhe público antigo retorna indisponível sem autenticação
   fictícia; autor ainda pode consultar o rejeitado.
7. Verificar Tab/Enter, setas/+/- e saída do mapa, largura360px, desktop e zoom200%,
   atribuição visível, rotas diretas/reload, Chrome e Firefox quando disponíveis.

Verificação automatizada: backend `./mvnw verify` com PostgreSQL Testcontainers;
frontend instalação frozen, `pnpm run lint`, `pnpm run typecheck`, `pnpm test` e
`pnpm run build`; `git diff --check`. Build Docker na raiz:
`docker build --build-arg VITE_API_URL=https://api.example.com --file frontend/Dockerfile --tag urban-reports-frontend:map-review .`.
Mock/jsdom e dados sintéticos não comprovam tiles, servidor remoto, dispositivo
físico, pipeline ou publicação. Evidências executadas pertencem à MR/issue.

## Checklist manual do pai #41

- [ ] Cadastro exige confirmação real do ponto; API recusa par inválido/ausente.
- [ ] Edição própria Pendente restaura/ajusta posição sem romper versão/moderação.
- [ ] Público e Meus relatos alternam Lista/Mapa com abrangência além da página.
- [ ] Detalhes mostram ponto ou ausência, mantendo fotografia e referência textual.
- [ ] Pinos/categorias/seleção e grupos permitem chegar a cada relato.
- [ ] Legado não ganha ponto fictício e permanece acessível pela lista.
- [ ] Falhas/GPS negado/tiles indisponíveis preservam alternativas e dados.
- [ ] Revisão/integracão operacional das duas tarefas aprovada antes de encerrar #41.

# Atualização das consultas visíveis

A [ADR 0030](adr/0030-polir-interface-e-atualizar-consultas-visiveis.md) define a
política da #55. `frontend/src/lib/live-query.ts` concentra defaults e classificação
de falhas. Integra somente hooks de listas pública/própria, marcadores, lista de
moderação e relatório JSON. QueryClient, chaves por filtro/página/usuário e
AbortSignal existentes permanecem; nenhum timer de escrita/exportação é criado.

| Superfície | Intervalo saudável | staleTime |
| --- | --- | --- |
| Lista pública/própria, marcadores do modo ativo, lista de moderação | 60 s | 30 s |
| Relatório administrativo JSON | 120 s | 60 s |

Entrada/foco/reconexão revalidam quando stale. `useSyncExternalStore` subscreve os
managers de foco e conectividade **já existentes** do Query; enabled depende de
rota/modo, identidade/papel, visibilidade e conexão. `refetchIntervalInBackground`
é false. Ocultar/offline pausa novas leituras; uma resposta já em trânsito pode
concluir. Ao sair da rota/chave, AbortSignal cancela a leitura sem observador;
logout cancela/remove prefixo privado. Não adicionar listeners DOM ou setInterval.

O mapa não consulta lista de cards; zoom/pan/GPS/seleção não compõem sua chave.
Reenquadrar não busca dados. Refetch de mesma chave conserva resultados, página,
scroll e viewport; seleção removida do universo é limpa sem recentralizar. Novo
filtro/página não recebe placeholder do contexto anterior. Detalhes de moderação,
formulários, gestão de contas, semelhantes e PDF não usam esta política. O sino
mantém seu polling separado de 120 s, sem novo efeito colateral.

## Falhas e recuperação

Retry imediato permanece false. Erro de rede (`TypeError` de fetch), HTTP 5xx,
408 e 429 usam intervalo após falhas consecutivas de 60/120/240/300 s nas listas
ou 120/240/300 s no relatório. Backoff pertence à query, compartilhado entre seus
observadores, com WeakMap sem cache persistente. Sucesso restaura o default.
Foco/reconexão/entrada stale podem antecipar uma tentativa; não há retry de escrita.

Demais HTTP 4xx, Zod/JSON/configuração inválidos param atualização automática
naquela chave até Tentar novamente ou novo contexto. 403 oculta dados restritos
sem logout; relatório também remove seu cache. 401 segue AuthProvider e encerra
sessão. Falha inicial não fabrica zero/vazio; falha de atualização preserva dados
com aviso. Referência do relatório só vem do generatedAt de resposta validada.
Botão de retry aparece no erro; não existe refresh permanente saudável.

Query v5 deduplica fetch em trânsito nos ticks/foco; não acoplar invalidate+refetch
nem invalidações pai+filho. Uma mutação invalida prefixos pertinentes uma vez.
PDF faz somente GET do PDF sob clique e conserva guarda síncrona/cancelamento;
um tick independente de JSON pode coincidir no tempo sem ser causado pelo download.

## Custo e validação

Defaults são ponto inicial, não capacidade/SLA. Uma aba visível saudável de mapa
ou lista adiciona até 1 GET/minuto de dados; relatório, até 0,5 GET/minuto. Entrada,
foco/reconexão stale, mutações, categorias, tiles, sino e mídia sob demanda têm
contagem separada. Medir requests concluídos/abortados, bytes e latência com um
conjunto representativo antes de ajustar os defaults centralizados. Não limitar
silenciosamente o endpoint completo de marcadores para disfarçar custo.

`live-query.test.tsx` usa relógio controlado, QueryClient novo e managers reais de
Query para intervalo, staleTime, pausa, retomada, backoff, erro permanente e
cancelamento/chaves. Suites das páginas preservam autorização, filtros, respostas
tardias e download independente. Evidências datadas e medições pertencem à MR/issue.

## Roteiro manual local

Usar ambiente local autorizado, contas/mídias sintéticas e API/storage de teste:

1. No registro, adicionar uma foto e depois outras quatro; permanecer na mídia.
   Navegar miniaturas/setas sem mudar capa/ordem. Definir outra como capa,
   organizar, remover ativa e última; Continuar só com seleção válida.
2. Repetir captura/galeria com MP4 suportado e MOV/HEVC/lote misto recusados;
   troca de tipo pede confirmação, cancelar mantém seleção. Ir até revisão,
   corrigir mídia/local/texto e voltar: dados e versão original permanecem.
3. Abrir lista e mapa com/sem filtro, alternar e voltar do detalhe. Limpar só
   aparece com filtro. GPS/enquadrar/zoom não disparam GET de relatos; mapa não
   salva ponto. Tiles têm retry próprio. Inspecionar em 360/390/768/1440 px,
   teclado/Tab/Enter/Escape e zoom nativo 200%, com safe area/navbar.
4. Abrir outra sessão/contexto local, criar/moderar relato sintético. Na primeira
   consulta visível aguardar até próximo tick para conferir dados novos, mantendo
   viewport/página/filtro. Relatório atualiza em até seu próximo tick saudável.
5. Ocultar aba por mais de dois intervalos e simular offline no DevTools: nenhum
   novo GET de dados enquanto suspensa. Voltar online/visível stale: uma leitura
   útil, sem A lenta substituir B e sem requests privados após logout.
6. Simular falhas somente na API local/controlada: transitórias preservam dados e
   espaçam ticks; schema/403 param; 401 encerra sessão. Retry explícito recupera.
7. Conta USER/ADMIN apresenta dados e Sair; destinos seguem navbar/sino. Conferir
   SUPER_ADMIN sem mudanças de home. Relatório mantém amostra/média parcial e
   referência; PDF manual, clique repetido pendente gera um GET PDF, sem JSON
   acoplado (contar separadamente eventual tick).
8. Android/iOS reais: menu/câmera/galeria/cancelamento, formatos produzidos e
   teclado virtual. Automação desktop com inputs não homologa câmera física.

Publicação somente pelo mantenedor após revisão e checks locais/CI, pelo fluxo
manual protegido existente. Sem secrets/migration/deploy backend novos. Homologação
Vercel/Render é separada; não provocar indisponibilidade remota para validar erros.

Referência: [useQuery v5](https://tanstack.com/query/v5/docs/framework/react/reference/useQuery),
[implementação QueryObserver](https://github.com/TanStack/query/blob/main/packages/query-core/src/queryObserver.ts).
Conferir assinaturas no pacote instalado; não copiar API de versão diferente.

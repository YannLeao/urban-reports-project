# Filtros de relatos

Categoria única e estado único são opcionais e combinados por AND, sempre após
as restrições de autoria, visibilidade e papel. Ausência significa todos os
valores permitidos. Não há busca textual, período, multisseleção ou ordenação nova.

| GET | Parâmetros novos | Universo e ordem |
| --- | --- | --- |
| `/api/public/occurrences` | `categoryId`, `status` | Público: PENDING/IN_ANALYSIS/RESOLVED; createdAt DESC, id DESC |
| `/api/public/occurrences/markers` | `categoryId`, `status` | Mesmo público, conjunto completo |
| `/api/occurrences` | `categoryId`, `status` | Autor da sessão, quatro estados, array completo; createdAt DESC, id DESC |
| `/api/occurrences/markers` | `categoryId`, `status` | Mesmo autor, conjunto completo |
| `/api/admin/occurrences` | `categoryId`, `status`, `scope=QUEUE` / `scope=ALL` | ADMIN ACTIVE, createdAt ASC, id ASC |

A fila QUEUE é o padrão compatível e aceita somente PENDING/IN_ANALYSIS.
ALL consulta também RESOLVED/REJECTED, sem novas ações sobre finalizados e sem
herança para SUPER_ADMIN. A conta/sessão administrativa é revalidada sob lock
antes de consultar o catálogo ou relatos. Page/size e envelopes permanecem nas
consultas pública/administrativa (0/20 por padrão; page >= 0, size 1–50).

Exemplos: `/api/public/occurrences?page=0&size=20&categoryId=2&status=IN_ANALYSIS`
e `/api/admin/occurrences?scope=ALL&status=RESOLVED&page=0&size=20`.
Marcadores recebem apenas os critérios, nunca página, limite ou viewport.

Categoria deve ser inteiro existente; enum e escopo são exatos. Valor vazio,
repetido, inexistente, tipo inválido ou estado proibido no contexto retorna 400
com VALIDATION_ERROR/fieldErrors sanitizados. Público REJECTED e QUEUE com
estado final são inválidos. `scope` é exclusivo da consulta administrativa.
Parâmetros externos de autoria não alteram a identidade. Filtros não leem
objetos de storage nem exigem novos campos no DTO. Metadados de mídia dos DTOs
existentes continuam com o contrato anterior; marcadores não carregam mídia.

`GET /api/public/occurrence-categories` é anônimo e retorna somente id/name,
ordenado por id, da mesma tabela do endpoint autenticado preservado. Somente o
GET exato foi liberado. O frontend compartilha schema e cache público sem Bearer;
erro oferece retry e mantém a opção Todas as categorias.

## Consulta, mapa e cache

Specification JPA aplica autoria/estados permitidos AND categoria AND estado
antes de count/offset/limit, com EntityGraph de categoria, sem join de coleção.
JDBC de marcadores usa os mesmos estados efetivos e parâmetros vinculados;
nenhum valor do cliente é concatenado em SQL. Uma instrução inclui linhas sem
ponto: total = located + unlocated e items.length = located. O mapa inclui pontos
de páginas posteriores, preservando ADR0019. Lista/mapa independentes podem
observar instantes diferentes sob concorrência.

URL da interface: `categoria=<id>&estado=<ENUM>`, com `escopo=todos` para ALL;
ausência de escopo é fila. Parser/serializer em `features/occurrence/filters.ts`
normaliza critérios por contexto; URL inválida recebe aviso e replace. Não existe
segundo estado local dos filtros. Alterar/limpar filtros reseta paginação numa
única navegação, remove seleção/grupo e preserva visão/viewport. Limpar preserva
escopo; voltar à fila remove estado final incompatível e informa o ajuste.
O enquadramento inicial também é registrado na URL para restaurar o mesmo
viewport quando uma nova seleção remonta o mapa. Paginação clona params. Retorno administrativo aceita path local exato e somente
pagina/categoria/estado/escopo válidos, impedindo redirecionamento externo.

Keys normalizam ausências para null e distinguem list/detail/markers:

- `['public','occurrences','list',{page,size,categoryId,status}]`;
- `['public','occurrences','markers',{categoryId,status}]`;
- `['private',userId,'occurrences','list',{categoryId,status}]`;
- `['private',userId,'occurrences','detail',id]`;
- `['private',userId,'occurrences','markers',{categoryId,status}]`;
- `['private',userId,'moderation','list',{page,size,scope,categoryId,status}]`;
- `['private',userId,'moderation','detail',id]`.

Visão/viewport/pino não entram na key. Cada seleção nova carrega sem placeholder
cruzado; resposta tardia não substitui outra key. AbortSignal/geração de auth,
401/403 e limpeza privada mantêm seus contratos. Refresh de marcadores da mesma
key pode mostrar dados anteriores com aviso. Mutações invalidam prefixos de todas
as variantes, incluindo inativas (marcadas stale e reconsultadas quando usadas),
sem refetch de todas por render. Allowlist privada valida nomes/valores/repetições
por endpoint e preserva a paginação existente de administradores e notificações.
Sem polling/retry automático de mutação. Semelhantes mantém seu prefixo próprio.
O relatório/PDF conserva indicadores globais e não recebe esses filtros.

## Validação local e roteiro manual

`OccurrenceFiltersIntegrationTests` usa cadeia real, sessões reais e PostgreSQL
17 descartável com 4096 relatos sintéticos intercalados, oito categorias, quatro
estados, dois autores, desempates e legado sem ponto. Gera
`backend/target/occurrence-filters-explain.txt` com EXPLAIN (ANALYZE, BUFFERS)
para lista/count/marcadores, filtros ausentes, isolados e combinados por contexto.
Esse arquivo é evidência local regenerável; tempos/resultados pertencem à MR.
Nenhum índice ou migration é pressuposto necessário.

1. Em banco local descartável, preparar relatos sintéticos de categorias/estados
   distintos, mais de uma página e um legado sem ponto. Não usar dados remotos.
2. Visitante: selecionar categoria e Em análise na pública. Esperar URL persistente
   no reload, total filtrado, páginas cheias quando houver dados e mapa completo
   com pontos além da página atual. Rejeitada não está disponível.
3. USER: filtrar próprios por Rejeitada. Esperar somente autoria atual em lista/mapa;
   interseção vazia informa Nenhum relato com estes filtros e oferece limpar.
4. ADMIN: começar na fila, selecionar Pendente/Em análise; alternar para Todos e
   escolher Resolvida/Rejeitada. Abrir detalhe e retornar: preservar filtros/escopo/
   página. Finalizados permanecem sem novas ações. Voltar à fila remove somente
   o estado final incompatível, mantém categoria e anuncia o ajuste.
5. Trocar filtro em página posterior: primeira página na mesma navegação. Limpar
   mantém visão/viewport/escopo. Alternar Lista/Mapa, voltar/avançar e selecionar
   pino: preservar consulta. Troca rápida ou movimento tardio não restaura filtro
   antigo. Simular falha/retry: erro difere de vazio e não exibe seleção anterior.
6. Editar/excluir/moderar: reabrir variantes de filtros e conferir listas, totais
   e pontos atualizados; não repetir mutação automaticamente. Encerrar/trocar sessão
   remove dados privados. Conferir teclado/foco, 360 px, intermediário, desktop
   e zoom 200%, sem rolagem horizontal.
7. Após revisão e aval explícito, publicar API compatível antes do frontend e
   homologar no ambiente publicado separadamente. Não há variáveis/secrets novos.
   Pipeline remoto, deploy e teste físico não são comprovados pelos checks locais.

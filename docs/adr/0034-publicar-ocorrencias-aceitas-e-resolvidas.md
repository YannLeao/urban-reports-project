# ADR 0034: Publicar ocorrências aceitas e resolvidas

## Contexto

O produto precisa permitir que visitantes consultem problemas urbanos e soluções
sem criar conta. A decisão de produto limita essa consulta aos relatos que já
passaram pela moderação: Aceita e Resolvida.

## Decisão

Este ADR substitui a restrição de consulta geral do ADR 0032 e a elegibilidade
pública anterior dos ADRs 0019 e 0029. GET de
`/api/public/occurrences` e subrecursos e HEAD de seus subrecursos são públicos.
Lista, marcadores, detalhe, alias de imagem e mídia GET/HEAD/Range usam a mesma
lista permitida de estados: ACCEPTED e RESOLVED. PENDING, REJECTED e IDs
inexistentes retornam 404 no detalhe e na mídia; filtros públicos desses estados
retornam 400. A verificação precede qualquer acesso ao armazenamento.

O DTO público continua sem identidade do autor, versão, chaves de storage ou
histórico de moderação. Conteúdo e coordenadas dos relatos publicados mantêm
sua precisão; fotos e vídeos continuam originais, conforme contratos existentes.
O mapa ilustrativo da home não representa relatos ou posições reais.

Autoria própria continua protegida, com acesso do autor aos quatro estados.
Moderação continua exclusiva de ADMIN ativo, sem herança. A consulta de
semelhantes continua retornando somente `hasSimilar`; não ganha IDs ou links.
Mutações públicas continuam negadas por padrão.

## Consequências

Visitantes e cidadãos podem explorar lista/mapa e filtrar resolvidas. Relatos
pendentes aguardam aceite para publicação; rejeitados permanecem privados.
A navegação cidadã distingue Explorar de Meus relatos. Os controles públicos
usam ícones com rótulos e estados acessíveis; não dependem somente de cor.

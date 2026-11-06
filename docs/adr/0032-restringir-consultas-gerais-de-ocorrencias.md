# ADR 0032: Restringir consultas gerais de ocorrências

## Contexto

Exibir todos os relatos para visitantes e cidadãos expõe uma visão geral da
cidade e permite consultar detalhes de terceiros.

## Decisão

As rotas frontend de consulta geral ficam disponíveis somente para ADMIN. Os
endpoints `/api/public/occurrences` e seus subrecursos também exigem ADMIN;
`/api/public/occurrence-categories` continua público para permitir o cadastro.
`/api/occurrences` e seus detalhes continuam limitados ao autor e retornam 404
para relatos de terceiros. A consulta de semelhantes não exibe dados
identificáveis nem links para relatos.

## Consequências

Visitantes e cidadãos não veem mapa/lista geral nem podem confirmar a existência
de relatos alheios. O painel administrativo continua podendo consultar o
universo geral, enquanto o mapa e componentes compartilhados permanecem
reutilizáveis para a administração.

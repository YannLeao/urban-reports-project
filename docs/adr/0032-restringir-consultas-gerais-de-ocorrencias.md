# ADR 0032: Restringir consultas gerais de ocorrências

## Contexto

Exibir todos os relatos para visitantes e cidadãos expõe uma visão geral da
cidade e permite consultar detalhes de terceiros.

## Decisão

As rotas frontend de consulta geral ficam disponíveis somente para ADMIN. Os
endpoints `/api/public/occurrences` e seus subrecursos também exigem ADMIN;
`/api/public/occurrence-categories` continua público para permitir o cadastro.
`/api/occurrences` e seus detalhes continuam limitados ao autor e retornam 404
para relatos de terceiros. A consulta de semelhantes retorna somente
`{hasSimilar:boolean}` para USER e ADMIN, sem lista/contagem ou dados identificáveis de candidatos. O frontend
valida esse contrato e não exibe links de relatos.

## Consequências

Visitantes e cidadãos não veem mapa/lista geral nem consultam detalhes de relatos
alheios. Na revisão autenticada, o aviso booleano informa apenas existência de
correspondência por categoria/proximidade, sem identificar o relato. O painel
administrativo continua podendo consultar o universo geral, enquanto o mapa e componentes compartilhados permanecem
reutilizáveis para a administração.

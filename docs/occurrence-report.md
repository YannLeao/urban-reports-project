# Relatório administrativo de relatos

ADMIN exato, ACTIVE e com sessão revogável válida consulta
`/administracao/relatorio`, pelo link Relatório. USER, SUPER_ADMIN e anônimo
não acessam os agregados. Desativação/logout confirmados impedem novas consultas,
inclusive com token emitido anteriormente. Guard e navegação complementam a
cadeia de segurança e a revalidação no serviço; não substituem autorização.

## Contrato HTTP

`GET /api/admin/reports/occurrences`, Bearer, sem parâmetros de período ou
paginação. Resposta 200 com `Cache-Control: no-store`. OpenAPI do controller
descreve a operação e gera o schema do DTO no perfil dev em `/v3/api-docs`.
Não retorna autoria, fotografia, storage, moderador ou justificativa.

| Campo | Tipo e significado |
| --- | --- |
| total | Inteiro não negativo; todos os relatos atualmente persistidos |
| categories | `{categoryId, categoryName, count}[]`; categorias cadastradas, por ID crescente, inclusive zeros |
| statuses | `{status, count}[]`; PENDING, IN_ANALYSIS, RESOLVED, REJECTED nessa ordem, inclusive zeros |
| localities | `{locality: string ou null, count}[]`; todos os grupos, contagem decrescente e desempate textual com collation C; ausentes por último no empate |
| averageResolutionSeconds | Número em **segundos**, ou null sem duração válida |
| resolvedSampleSize | Inteiro; resolvidas com duração válida consideradas na média |
| resolvedWithoutValidDuration | Inteiro; resolvidas excluídas da média por inconsistência |
| rejectedPercentage | Número de **0 a 100**, ou null se total zero; o cliente não multiplica por 100 |
| generatedAt | Instante UTC de início da transação de leitura, sem promessa de atualização em tempo real |

Erros seguem `ApiErrorResponse` e no-store: 401 sessão ausente/inválida/revogada
ou conta inativa; 403 papel sem permissão; 503 `ADMINISTRATION_UNAVAILABLE`
em falha de persistência; 500 `INTERNAL_ERROR` para falha inesperada.

## População e fórmulas

N é `count(*)` de occurrences, de todos os autores e dos quatro estados,
inclusive rejeitados invisíveis ao público. Exclusão é física e permitida apenas
em PENDING: registros removidos não entram, nem são reconstruídos pelo histórico.
Não representa o total histórico de tudo que já foi cadastrado. Cada distribuição
usa a mesma população e sua soma é N; joins de histórico não multiplicam contagens.
Categoria é NOT NULL com FK, portanto categoria ausente é impossível no schema
vigente. Rótulos e IDs vêm do cadastro atual, sem renumeração.

Localidade usa somente neighborhood. Trim externo remove U+0009–U+000D e U+0020,
como os campos textuais do cadastro. Valores null/vazios após trim são um grupo
com chave null, exibido como “Não informado”. O texto literal “Não informado”
continua um grupo próprio. Caixa, acentos e espaços internos são preservados;
“Centro”, “centro” e “Céntro” são distintos. Não se modifica o cadastro nem se
deriva bairro de GPS/referência/foto. O schema atual impede null e strings com
menos de dois caracteres, mas admite espaços e dados legados; o agregador trata
ausência sem relaxar constraints. Nenhum grupo é ocultado por top-N.

Para cada ocorrência atualmente RESOLVED, a duração é o instante UTC do evento
final válido RESOLVED menos created_at, continuamente, incluindo noites e fins
de semana. A média é `sum(duração) / resolvedSampleSize`, em segundos,
preservando frações antes da média. Não usa versão de página, data da consulta,
início da análise ou edição como substitutos da criação/resolução.

A máquina vigente não reabre estados finais. O evento é elegível se existe
exatamente uma resolução e um único evento final (RESOLVED/REJECTED); sua versão
é a versão atual da ocorrência e a maior do histórico; nenhum evento tem
instante posterior à resolução ou anterior à criação. Resolução ausente,
duplicada/incompatível, evento posterior ou duração negativa excluem a ocorrência
da amostra, incrementam resolvedWithoutValidDuration e geram aviso de média
parcial. Não se escolhe arbitrariamente entre resoluções, fabrica horário ou
reescreve histórico. Duração zero é válida. Sem amostra válida, média null.

Rejeitadas entre todos os relatos = `100.0 × R / N`, R sendo a contagem atual
REJECTED. N positivo e R zero retorna 0; N zero retorna null. A interface arredonda
somente a apresentação do percentual (uma casa decimal) e da duração legível;
mantém segundos com precisão significativa na ajuda expansível. Null aparece como “Sem dados”,
sem confundir com zero ou falha de rede.

## Consistência, eficiência e cache

O serviço abre transação própria readOnly com REPEATABLE READ. Autorização e
as cinco consultas de agregação compartilham um snapshot PostgreSQL. Não há
FOR UPDATE, lock de conta/ocorrência, carregamento de entidades de relatos,
I/O de imagens nem N+1. Autorização de leitura consulta as mesmas contas/sessões
do sistema, sem usar o lock destinado a mutações. Consultas iniciadas após
desativação confirmada são negadas; leitura já autorizada pode terminar conforme
o snapshot, como no contrato de requisições em andamento do ADR 0011.

A leitura global requer percorrer a população; agrupa histórico uma vez por
ocorrência antes de calcular a média. Índices existentes de categoria e histórico
(occurrence_id/version e occurrence_id/occurred_at/version) são preservados.
Não há novo filtro seletivo que justifique índice/migration nesta versão.
Volumes maiores exigem medição própria; não há promessa de desempenho em produção.
Veja [ADR 0017](adr/0017-consultar-relatorio-em-snapshot.md).

Zod valida estrutura, nullabilidade e coerência básica das distribuições.
Query usa `['private', userId, 'occurrence-report']`, AbortSignal, sem retry,
polling, refetch por foco ou reconexão. Logout/401 cancelam e limpam caches pelo
AuthProvider; 403 remove o cache do relatório e esconde agregados sem encerrar
a sessão. Falha de rede em atualização preserva os dados com aviso explícito e
referência da consulta anterior. Falha inicial nunca preenche indicadores com
zeros. Transição administrativa confirmada invalida o relatório no mesmo
cliente; mudanças de outros clientes aparecem ao clicar Atualizar relatório.

## Desenvolvimento e revisão manual

Use [provisionamento local](admin-provisioning.md#subir-para-revisão-local):
PostgreSQL, chaves RSA externas, `.env` locais e Mailpit para ler convites sem
consultar banco/logs. Se necessário, crie o primeiro SUPER_ADMIN pelo bootstrap
interativo documentado; entre em `/administracao/contas`, convide ADMIN, abra
o convite no Mailpit, ative e faça login normal. Não há seed ou atalho de papel.

Com os runtimes fixados e configuração local pronta, na raiz:

```bash
docker compose up -d db
(cd backend && JAVA_HOME="$HOME/.jdks/ms-21.0.12.1" ./mvnw spring-boot:run -Dspring-boot.run.profiles=dev)
# Em outro terminal, com Node 22.23.2 e pnpm 10.34.5 ativos:
(cd frontend && pnpm install --frozen-lockfile && VITE_API_URL=http://localhost:8080 pnpm run dev)
```

Ajuste JAVA_HOME ao JDK 21 instalado. A página fica em
http://localhost:5173/administracao/relatorio. R2 é necessário apenas para
registrar/ver fotos reais no fluxo de criação; a leitura dos agregados não
depende de storage, envio de e-mail ou mapas. ADMIN já ativo não precisa de novo convite.

1. Em banco local vazio, conferir total 0, média/percentual “Sem dados”, oito
   categorias e quatro estados zerados, tabela vazia.
2. Criar relatos sintéticos via USER e moderá-los com ADMIN. Comparar total e
   somas das três distribuições, inclusive rejeitados fora da consulta pública.
   A suíte automatizada contém o conjunto de seis relatos (média 4 horas,
   rejeitadas 33,3%) e não exige esperar horas para produzir os intervalos.
3. Conferir média sem resolvidas e 0% sem rejeitadas. Excluir um próprio PENDING
   como autor e atualizar o relatório; confirmar retirada de todos os agregados.
4. No mesmo cliente, moderar e voltar ao relatório: consulta invalidada. Em outro
   navegador, moderar e clicar Atualizar relatório no primeiro para ver mudanças.
5. Interromper a API local após uma leitura: atualização falha, dados anteriores
   permanecem identificados. Retomar e tentar novamente. Na primeira leitura sem
   API, somente erro/retry, sem indicadores inventados.
6. Abrir diretamente e recarregar a rota. USER/SUPER_ADMIN recebem acesso restrito;
   anônimo vai ao login. Desativar ADMIN em outro navegador como SUPER_ADMIN:
   próxima atualização recebe 401, encerra sessão e remove os dados privados.
7. Conferir 360 px, desktop, zoom 200%, Tab/Shift+Tab/Enter, foco visível e tabelas
   com rótulos longos. Barras têm contagens textuais e não dependem de cor.

Os testes de integração usam PostgreSQL descartável, JWT e cadeia reais,
provisionamento suportado e Clock controlado. Fixtures inconsistentes são
restritas ao teste e respeitam constraints/imutabilidade existentes. Um teste
com latches pausa a leitura após estabelecer o snapshot e confirma moderação
concorrente antes de liberá-la, sem sleeps. Frontend usa fetch controlado,
AuthProvider/Query/rotas reais. Navegação com API simulada comprova apresentação,
não integração publicada, envio externo de e-mail ou aceite remoto.

```bash
(cd backend && JAVA_HOME="$HOME/.jdks/ms-21.0.12.1" ./mvnw verify)
(cd frontend && pnpm run lint && pnpm run typecheck && pnpm test && pnpm run build)
git diff --check
```

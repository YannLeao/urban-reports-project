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

## Download em PDF

`GET /api/admin/reports/occurrences/pdf`, Bearer, exige o mesmo ADMIN exato,
ACTIVE e sessão válida, sem filtros/corpo/números do cliente. Não muda a rota JSON.
Resposta pronta: 200 `application/pdf`, `Cache-Control: no-store`,
`X-Content-Type-Options: nosniff`, Content-Length e attachment com nome ASCII
`alo-cidade-relatorio-uuuuMMdd-HHmmssZ.pdf` gerado pelo servidor em UTC.
Sem CORS adicional: o cliente usa nome controlado, sem ler Content-Disposition.

“Baixar PDF” faz **nova consulta consistente**, uma chamada ao serviço do ADR 0017,
e não atualiza/invalida o painel. A nota junto à ação explica a diferença.
Referência dos dados (`Report.generatedAt`) e geração do arquivo (Clock) aparecem
separadas em America/Sao_Paulo, com offset explícito. Dados podem diferir de um
painel antigo sob concorrência. A transação termina antes da renderização.

A4 retrato, Figtree embutida, marca Alô Cidade e cores canônicas, texto selecionável,
contagens/barras e todas as localidades na ordem da consulta, sem top-N. Categorias
e estados incluem zeros. Média e percentual preservam os valores do snapshot,
com unidades/arredondamento apenas visual. Amostra/exclusões e aviso de média
parcial ficam junto à média; ausência não é duração zero. O PDF distingue null
como “Não informado (campo vazio)” do texto literal “Não informado”. Grafias não
são fundidas. Glifos ausentes/controles viram `[U+XXXX]` com nota; conteúdo é texto
puro, sem links, execução de HTML/JavaScript, anexos ou recursos remotos.

Nenhuma ocorrência individual ou identificação pessoal é incluída. Texto livre
de localidade pode conter informação indevida; agregação não garante anonimização.
Metadados são institucionais, idioma pt-BR; não há certificação PDF/A ou PDF/UA.
Revogar sessão não apaga PDFs previamente baixados.

Geração limitada a uma por instância, sem fila: 503 `REPORT_PDF_CAPACITY` quando
ocupada ou excedidos os limites de 512 páginas/16 MiB/orçamento cooperativo de
30 s de layout. Não há truncamento. Banco mantém 503 `ADMINISTRATION_UNAVAILABLE`;
fontes/renderização inesperada retornam 500 `INTERNAL_ERROR` sanitizado/no-store.
PDF completo precede sucesso; falhas nunca viram PDF parcial/relatório zerado.
[Limitações de memória, assets/licenças e medição](report-pdf-assets.md) e
[ADR 0028](adr/0028-exportar-relatorio-administrativo-em-pdf.md).

Frontend não faz retry automático e preserva o painel em rede/500/503 ou resposta
inválida. Busy/guarda síncrona evitam clique/Enter repetido. 401 encerra sessão;
403 oculta/limpa os agregados sem logout. AbortSignal cancela leitura em saída,
logout/troca de contexto; não baixa resposta tardia. Leitura até EOF limitada a
16 MiB, MIME PDF e marcadores básicos obrigatórios antes de Blob/link. Link e
object URL são removidos após início do download (timer de 1 s) e na desmontagem.
Binário não entra em Query/storage, e token nunca entra em URL.

### Roteiro manual do PDF

Usar somente ambiente local e dados sintéticos; não esvaziar banco real.

1. Entrar como ADMIN ativo, abrir `/administracao/relatorio` e baixar. Esperado:
   arquivo parseável, nome ASCII UTC, referências separadas e indicadores iguais
   à nova leitura. Abrir em leitor comum, selecionar/copiar acentos e números.
2. Conferir total, média contínua, amostra/exclusões, rejeitadas 0–100 e todas as
   categorias/estados inclusive zeros. Base vazia deve ter zeros e “Sem dados”;
   média parcial deve identificar exclusões, sem confundir duração zero.
3. Incluir localidades null/espaços, literal “Não informado”, acentos, nome longo,
   emoji/script sem glifo e volume para várias páginas. Esperado: grupos separados,
   contagem preservada, `[U+XXXX]` visível com nota, cabeçalhos repetidos, rodapés
   Página X de Y e nenhum corte. Conferir escala de cinza A4 em 100%.
4. Alterar dados sintéticos depois de abrir o painel e baixar. Esperado: PDF com
   nova referência/snapshot; painel mantém sua consulta anterior sem anunciar refresh.
5. Simular erro local/fonte ausente/banco indisponível. Esperado: JSON 500/503
   sanitizado/no-store; navegador mostra “Não foi possível gerar o PDF. Tente
   novamente”, sem salvar JSON como PDF ou apagar os indicadores. Só novo clique
   repete a ação. Duplo clique/Enter gera um download; sair/logout antes de terminar
   impede arquivo tardio. Falha de logout preserva sessão conforme contrato de auth.
6. USER/SUPER_ADMIN recebem 403 e anônimo/inválido/expirado/revogado/inativo 401.
   No frontend, 403 esconde agregados sem encerrar sessão; 401 encerra e limpa cache.
7. Conferir 360 px/desktop, foco/Tab/Enter e busy, e abrir o arquivo em leitor/celular
   disponível. Após autorização/publicação, repetir na origem canônica com backend
   novo antes do frontend, registrando resultados remotos separadamente.

Os testes `OccurrenceReportPdfTests` geram exemplos reais em
`backend/target/report-pdf-review/{reference,empty,partial,localities}.pdf`.
Renderizar **todas** as páginas e inspecionar as imagens, além do texto extraído:

```bash
pdftoppm -png -r 144 backend/target/report-pdf-review/localities.pdf /tmp/localities
pdftotext -layout backend/target/report-pdf-review/localities.pdf /tmp/localities.txt
```

`target/` é ignorado; não versionar PDFs/imagens de revisão. Executar verify backend,
checks frontend e `pnpm run report-pdf:assets:check`. Testes de download usam fetch
controlado e PDF sintético; revisão em navegador com API simulada não homologa
backend publicado nem integração remota.

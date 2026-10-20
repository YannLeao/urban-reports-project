# Sugestões de relatos próximos

A [decisão 0026](adr/0026-alertar-relatos-por-proximidade.md) substitui RN-20 textual
por categoria + proximidade. No cadastro e na edição, “Revisar relato” valida o formulário completo
e abre a quarta etapa do [Wizard](report-wizard.md). Nenhum multipart/upload é iniciado
até uma confirmação adicional explícita. Não há revisão adicional depois dessa etapa.

## Contrato

`POST /api/occurrences/similar`, Bearer de USER ativo, sessão válida/revogável,
`Content-Type: application/json`. Corpo até 8192 bytes, sem query string:

```json
{"categoryId":2,"latitude":-8.336,"longitude":-36.424,"excludeOccurrenceId":"00000000-0000-4000-8000-000000000001"}
```

Exemplo sintético. Omitir exclusão no cadastro; na edição, informar ID próprio,
com 404 uniforme para alheio/inexistente. Usar ponto/categoria do rascunho atual.
Categoria deve existir; coordenadas são números JSON finitos, latitude [-90,90],
longitude [-180,180], par completo. Strings numéricas, null, UUID não canônico,
propriedades repetidas/desconhecidas, tokens posteriores e parâmetros são inválidos.
Zero é válido. JSON excedente é recusado mesmo sem Content-Length.

Resposta: `{radiusMeters:100,limit:5,items:[...]}`. Cada item contém exatamente
`id`, `categoryId`, `categoryName`, `title`, `neighborhood`, `reference`, `status`,
`createdAt` (ISO instant) e `distanceMeters` (número finito entre 0 e 100).
Não contém autoria, versão, histórico, descrição, mídia/keys/URLs ou coordenadas
do candidato. `items:[]` representa sucesso vazio; 400 INVALID_REQUEST,
401 sessão inválida, 403 papel incorreto, 404 OCCURRENCE_NOT_FOUND,
503 SIMILAR_OCCURRENCES_UNAVAILABLE para falha de persistência. Autenticação
indisponível pode produzir 503 antes do controller, no envelope Security vigente.
Todas as respostas são `Cache-Control: no-store`, inclusive erros.

SQL parametrizado filtra categoria, estados PENDING/IN_ANALYSIS, coordenadas
válidas e exclusão; Haversine com raio terrestre 6371008.8 m, argumento limitado
[0,1], distância <=100 sem arredondamento. Ordena distância ASC, createdAt DESC,
id DESC antes de LIMIT 5. Sem limite preliminar, extensão, geocodificação, storage
ou escrita de domínio. Índice atual de categoria permanece. Plano reproduzível
com 20 mil relatos sintéticos em `SimilarOccurrenceIntegrationTests`, saída em
`backend/target/similar-query-plan.txt`; o limite não evita cálculo dos candidatos.

## Revisão no Wizard

`similar-occurrences.ts` define cliente/schema dedicado; `useSimilarOccurrences`
recebe categoria, coordenadas exatas e exclusão opcional. Entrada explícita na etapa de
revisão inicia consulta autenticada cancelável. Chave Query privada inclui usuário
e todos os critérios, sem arredondar. Cache em memória é removido ao desmontar,
sem persistência. Timeout de 10 s cobre inclusive leitura cancelável do JSON (resposta limitada a 32 KiB no cliente). Sem retries
automáticos, polling ou refetch por foco/reconexão. Voltar sem mudar critérios
reutiliza a revisão atual; mudar categoria/ponto/usuário descarta resultado e decisão.

`SimilarOccurrencesReview` apresenta carregamento, sucesso vazio, sugestões,
indisponibilidade e legado sem ponto. Oferece “Revisar meu relato” e confirmação
explícita; com sugestões, “É outro relato, enviar”/“É outro relato, salvar”. Falha auxiliar oferece
“Consultar novamente” e “Enviar mesmo assim”/“Salvar mesmo assim”. Atualização manual também é oferecida após sucesso. Durante carregamento, confirmação
fica indisponível. 403 informa falta de acesso, sem bypass; 401 encerra sessão.
Enter apenas abre revisão. Guarda síncrona impede dupla gravação; handler final
revalida campos, mídia pronta e critérios. Textos, File/ordem/capa, ponto e versão
congelada sobrevivem à revisão e falhas. Resultado incerto de escrita mantém aviso
de risco de reenvio; a consulta não acrescenta idempotência.

Cartões textuais não buscam mídia. Links constroem `/ocorrencias/:id`, abrem nova
aba com aviso e `noopener noreferrer`. Rejeição/exclusão posteriores tornam detalhe
e mídia indisponíveis conforme autorização pública atual. Não há flag global de
privacidade no domínio. Legado sem ponto não consulta nem fabrica (0,0), podendo
salvar conforme contrato vigente. O Wizard integra hook/painel na etapa 4, preservando estado do formulário
e cancelando consultas pendentes ao sair da revisão, sem reproduzir busca/upload.

## Roteiro local

Use JDK 21, FFmpeg/FFprobe e Docker; Node 22.23.2 e pnpm 10.34.5.
Em backend/: `./mvnw -Dtest=SimilarOccurrenceIntegrationTests test` e `./mvnw verify`.
Em frontend/: `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm run lint`,
`pnpm run typecheck` e `pnpm run build`. Testes backend usam PostgreSQL descartável,
RSA efêmera e contas fictícias; frontend usa fetch controlado, sem mapa/GPS remoto.

Para teste humano, use apenas ambiente local com banco descartável, contas e
storage de teste conforme guias de registro/segurança. Não apontar para produção.

1. Preparar relatos sintéticos da mesma categoria a 0, 30, 90 e mais de 100 m,
   outros ativos suficientes para superar cinco, outra categoria, RESOLVED,
   REJECTED e legado sem ponto. Fixtures automatizadas cobrem também fronteira
   exata, imediatamente fora, sinais/eixos, polos e antimeridiano.
2. Preencher formulário válido, mídia concluída e ponto confirmado. Acionar envio:
   somente POST JSON de consulta, até cinco ativos ordenados, nenhum upload,
   autoria ou fetch de mídia no alerta. Vazio deve dizer “nesta consulta”.
3. Abrir candidato em nova aba, voltar, revisar texto/fotos e reabrir revisão:
   preservar rascunho. “É outro relato, enviar” deve realizar um único multipart,
   sem flag de duplicidade e sem modificar status por causa da sugestão.
4. Alterar categoria/ponto durante consulta lenta: cancelar/inutilizar resultado
   anterior. Enter não grava. Na edição, excluir próprio relato e preservar If-Match
   original mesmo após leitura de detalhe em segundo plano. Legado sem ponto
   informa não execução e ainda permite salvar sem coordenadas.
5. Simular rede/503/timeout/JSON inválido somente em fetch/proxy local controlado:
   erro distinto de vazio; retry manual e envio explícito preservam dados. 401 deve
   encerrar sessão, 403 mantê-la e mostrar falta de acesso. Falha/resultado incerto
   de escrita não pode gerar repetição automática.
6. Rejeitar/excluir candidato após busca: abrir detalhe/mídia deve retornar 404.
   Verificar Tab, foco inicial no painel, links de nova aba, 360px e zoom 200%, sem
   rolagem horizontal. Não há foto/vídeo novo na lista de sugestões.

## Homologação Render/Vercel pelo mantenedor

Publicar somente após revisão/autorização pelos jobs manuais vigentes. Backend
primeiro disponibiliza endpoint, depois frontend recompilado com VITE_API_URL do
ambiente. Sem migration, nova variável, chave, serviço ou configuração R2 para a
consulta; envio de mídia continua usando sua integração existente.

Em contas/dados de teste controlados e autorizados, repetir passos 1–4 e 6 acima,
sem coordenadas pessoais. Conferir SHA e endpoint na versão publicada, sessão,
CORS e reload das rotas. Não derrubar banco nem alterar credenciais remotas para
provocar erro; passo 5 fica local. Registrar evidências e resultado humano na MR/issue.
A configuração/testes locais não comprovam deploy, captura física, GPS ou aceite remoto.

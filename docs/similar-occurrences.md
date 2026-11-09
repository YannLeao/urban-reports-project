# Aviso de relatos próximos

A [decisão 0026](adr/0026-alertar-relatos-por-proximidade.md) define categoria +
proximidade; a [restrição de visibilidade](adr/0032-restringir-consultas-gerais-de-ocorrencias.md)
limita a resposta a um booleano. Cadastro e edição consultam a existência de
relatos elegíveis na revisão do [Wizard](report-wizard.md), sem listar candidatos
nem iniciar multipart/upload. A consulta não agrupa relatos, não comprova
que sejam duplicados e não bloqueia o envio explícito.

## Contrato HTTP

`POST /api/occurrences/similar`, Bearer de USER ou ADMIN ativo, sessão válida e
revogável, `Content-Type: application/json`. Mesmo contrato mínimo para ambos os
papéis. Corpo até 8192 bytes efetivamente lidos, sem query string:

```json
{"categoryId":2,"latitude":-8.336,"longitude":-36.424,"excludeOccurrenceId":"00000000-0000-4000-8000-000000000001"}
```

Exemplo sintético. Omitir exclusão no cadastro; na edição, usar ID próprio,
com 404 uniforme para alheio/inexistente. Categoria existente; coordenadas JSON
numéricas finitas, latitude [-90,90], longitude [-180,180]. Par completo; zero
é válido. Strings numéricas, null, UUID não canônico, propriedades extras ou
repetidas, tokens posteriores e parâmetros são recusados.

O corpo completo de sucesso contém somente:

```json
{"hasSimilar":true}
```

Sem correspondência: `{"hasSimilar":false}`. Sem lista, contagem, IDs, títulos,
bairros, referências, estados, datas, distâncias, mídia ou autoria dos candidatos.
O aviso permite saber que existe correspondência nos critérios informados, sem
identificar qual relato. Consultar um detalhe próprio de terceiro continua
retornando 404; a visão geral continua exclusiva de ADMIN.

Erros: 400 INVALID_REQUEST, 401 sessão inválida, 403 papel incorreto,
404 OCCURRENCE_NOT_FOUND, 503 SIMILAR_OCCURRENCES_UNAVAILABLE para persistência.
Autenticação indisponível pode produzir 503 antes do controller. Todas as
respostas e erros são `Cache-Control: no-store`; falha nunca vira falso.

SQL parametrizado usa `EXISTS`, mesma categoria, PENDING/ACCEPTED, coordenadas
válidas e exclusão própria. Haversine, raio terrestre 6371008.8 m, argumento
limitado a [0,1], distância <=100 m sem arredondamento. Não seleciona dados de
candidatos nem precisa ordenar/contar/limitar uma lista. Não há extensão espacial,
geocodificação, storage ou escrita. Índice atual de categoria preservado. O plano
com 20 mil relatos sintéticos fica em `backend/target/similar-query-plan.txt` após
`SimilarOccurrenceIntegrationTests`; não é um SLA de produção.

## Revisão no Wizard

`similar-occurrences.ts` valida estritamente `{hasSimilar:boolean}`.
`useSimilarOccurrences` consulta somente na revisão, com categoria, ponto exato
e exclusão opcional; chave privada inclui usuário e critérios, sem arredondar.
Cache efêmero em memória, cancelamento e timeout de 10 s, inclusive leitura do
JSON limitada a 32 KiB. Sem retry automático, polling ou refetch por foco/reconexão.
Sair e reabrir a revisão dispara nova consulta; mudar critérios invalida contexto.

O painel distingue carregamento, correspondência, ausência, indisponibilidade,
autorização negada e legado sem ponto. Exibe aviso sem dados ou links de terceiros.
Durante consulta não permite confirmar; após sucesso a gravação é explícita.
Falha auxiliar permite “Enviar mesmo assim”/“Salvar mesmo assim”; 401 encerra
sessão, 403 informa falta de acesso sem bypass. Não existe botão de retry na
revisão: voltar e avançar consulta novamente. Legado sem ponto não consulta nem
fabrica coordenadas. Mídia/texto/local/versão original permanecem no rascunho.
Uma única confirmação final inicia upload, sem flag de duplicidade ou associação.

## Validação local

Usar JDK 21, FFmpeg/FFprobe e Docker; Node 22.23.2 e pnpm 10.34.5.
Em backend/: `./mvnw -B -Dtest=SimilarOccurrenceIntegrationTests test` e
`./mvnw -B verify`. Em frontend/: `pnpm test`, `pnpm run lint`,
`pnpm run typecheck` e `pnpm run build`, com dependências instaladas pelo lockfile.
Testes usam PostgreSQL descartável, RSA efêmera e contas fictícias; front usa
fetch controlado, sem serviço remoto.

1. A e B são cidadãos distintos; B recebe 404 no detalhe próprio de A. Consulta
   de B para categoria/ponto de A elegível retorna exatamente `{"hasSimilar":true}`;
   outra categoria/local sem candidato retorna exatamente falso. Repetir como ADMIN.
2. Conferir raio inclusivo e imediatamente fora, PENDING/ACCEPTED versus finais,
   sem coordenadas, sinais/eixos, polos/antimeridiano e exclusão própria na edição.
3. Revisão informa correspondência/vazio sem links/identificadores e sem upload.
   Corrigir etapas preserva rascunho; confirmar faz uma única gravação.
4. Simular rede/503/timeout/JSON inválido apenas localmente: distinguir de vazio,
   preservar dados e permitir envio explícito. 401/403 não permitem bypass.
5. Conferir sessão ausente/revogada e SUPER_ADMIN negados, autoria da exclusão,
   cancelamento e resultados tardios. Não registrar tokens nem coordenadas pessoais.

## Publicação coordenada pelo mantenedor

**Backend primeiro, frontend em seguida**, após revisão e pelos jobs manuais
vigentes. O backend encerra imediatamente a exposição HTTP com a resposta mínima;
publicar só o frontend não corrige a resposta do backend antigo. Não há migration,
nova variável, chave, serviço ou alteração de R2 para esta mudança.

Durante backend novo + frontend antigo, o schema antigo espera `items` e recusa
a resposta booleana. A revisão mostra consulta indisponível e permite o envio
explícito “Enviar mesmo assim”/“Salvar mesmo assim”; não interpreta a resposta
como ausência de semelhantes. Upload e autenticação mantêm os contratos.
Frontend novo + backend antigo também recusa o formato legado como indisponível,
mas a exposição HTTP persistiria: essa ordem não é recomendada. O cliente novo
não aceita formato antigo nem conserva compatibilidade que reintroduza candidatos.
Erros HTTP 401/403 continuam sem bypass nas duas janelas.

1. Publicar backend revisado, conferir SHA/boot/health e testar como USER e ADMIN
   o corpo completo true/false, sessão/papel e 404 de autoria. Não confiar apenas
   no status do hook de deploy. Na janela, conferir erro auxiliar no frontend antigo.
2. Publicar frontend recompilado com VITE_API_URL do destino. Em nova sessão/aba,
   conferir revisão true/false, indisponibilidade, registro e edição com exclusão.
   Conferir também o bundle efetivamente servido, reload e CORS.
3. Registrar SHAs, URLs/resultados na MR/issue. Preferir repetir mutações em
   ambiente de teste autorizado com dados sintéticos. Não provocar falhas remotas.
   Rollback do frontend preserva a correção HTTP; rollback do backend para a versão
   com candidatos reabre a exposição e exige decisão explícita, preferindo avanço.

Configuração/testes locais não comprovam deploy, R2, câmera física ou aceite remoto.

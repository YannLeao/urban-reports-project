# Prova técnica de armazenamento de imagens

O contrato de coleção de 1–5 fotografias, manifesto de edição e publicação coordenada está em [múltiplas fotos](multiple-photos.md).

Este guia descreve a integração técnica com um bucket privado do Cloudflare R2. O registro autenticado de ocorrência usa a mesma abstração e grava a referência do objeto no PostgreSQL.

A [prova de seleção e captura no frontend](image-selection-proof.md) em
`/prova-imagem` mantém a imagem apenas em memória e não utiliza estes endpoints.

## Contrato técnico

- Upload: `POST /api/storage/images`, `multipart/form-data`, campo `file`.
- Recuperação: `GET /api/storage/images/{id}`.
- Formatos aceitos: JPEG (`image/jpeg`), PNG (`image/png`) e WebP
  (`image/webp`).
- Limite da regra: 5 MiB por arquivo (5 × 1024 × 1024 = 5.242.880 bytes).
- Keys internas: `proofs/{UUID}.{extensão-validada}` para a prova técnica e
   `occurrences/{UUID}.{extensão-validada}` para ocorrências.
- Identidade devolvida: `UUID.extensão`, sem nome original, bucket ou URL do R2.

O MIME informado, a estrutura e a decodificação dos pixels são validados no
servidor, conforme os [limites de imagem](occurrence-registration.md#imagens). O nome
original não participa da key. O bucket deve permanecer privado e a recuperação
sempre passa pelo backend.

## Preparar o Cloudflare R2

1. Crie um bucket de desenvolvimento no painel do R2 sem habilitar domínio
   público ou `r2.dev`.
2. Crie credenciais S3 com permissão de leitura e escrita limitada a esse
   bucket. Não reutilize credenciais administrativas.
3. Copie `backend/.env.example` para `backend/.env` e substitua somente os
   valores locais:

```properties
IMAGE_STORAGE_ENDPOINT=https://SEU_ACCOUNT_ID.r2.cloudflarestorage.com
IMAGE_STORAGE_REGION=auto
IMAGE_STORAGE_BUCKET=urban-reports-development
IMAGE_STORAGE_ACCESS_KEY=SUA_CHAVE_LOCAL
IMAGE_STORAGE_SECRET_KEY=SEU_SEGREDO_LOCAL
```

O arquivo `backend/.env` é ignorado pelo Git. Confirme antes de qualquer commit:

```bash
git check-ignore -v backend/.env
```

## Acesso HTTP bloqueado

A base de segurança bloqueia a prova técnica em todos os perfis, inclusive dev.
O roteiro anterior de upload público não funciona mais: sem Bearer válido,
POST e GET retornam 401; autenticados, retornam 403. CSRF está desabilitado na
cadeia Bearer sem cookies (ADR 0011). Configurar R2 não altera essa política.
A criação autorizada acontece em `/api/occurrences`, sem abrir storage técnico.

Para verificar localmente, sem acessar objeto de terceiros:

```bash
curl --include http://localhost:8080/api/storage/images/00000000-0000-0000-0000-000000000000.png
curl --include --request POST http://localhost:8080/api/storage/images
```

Espere 401 JSON no GET e no POST sem credencial. O contrato técnico acima permanece
interno e é validado por testes; veja a [matriz de segurança](security.md).

## Testes automatizados

```bash
cd backend
./mvnw test
```

Os testes internos de controller/service usam um fake em memória de `ImageStorage`
para uploads e recuperações, sem filtros nessa camada. Testes de segurança
independentes mantêm a cadeia real e comprovam bloqueio sem chamar o provedor.
Esses testes não acessam a Cloudflare nem usam credenciais reais. Downloads de
dependências/imagens exigem rede quando não estão em cache. Docker é necessário para os testes de integração, incluindo segurança e PostgreSQL/Flyway.

## Ocorrências

`POST /api/occurrences` é autenticado e recebe os campos textuais e de uma a cinco
partes `images` em multipart (ou `image` legado singular, sem mistura). O serviço valida o conteúdo, grava as imagens em
`occurrences/` e só então persiste a ocorrência `PENDING` com o `userId` da
sessão. A key é registrada antes do PUT em journal durável e vinculada na mesma
transação da ocorrência; veja recuperação abaixo. Falhas são recuperadas
eventualmente, sem garantia de remoção imediata.

## Limites deliberados

Esta integração não implementa URL pública/assinada, transformação, moderação,
remoção de EXIF ou uma rotina agendada de varredura de órfãos. As referências ordenadas ficam em `occurrence_media`; a primeira é a capa.

A validação usa JPEG/PNG do JDK 21 e `imageio-webp` TwelveMonkeys 3.15.1
(BSD-3-Clause, Java puro) para WebP. Não reencoda, recorta, gira nem remove EXIF.
A leitura pública atual serve os bytes originais, inclusive EXIF. Sanitização
de metadados segue pendente para decisão do mantenedor; bucket privado e
decodificação não garantem anonimização. Consulte
[ADR 0012](adr/0012-validar-conteudo-e-limites-de-imagens.md).

## Recuperação durável

Novos uploads de ocorrência registram a key antes do PUT na V5. Validação ocorre
antes da intenção; a intenção confirma em transação própria. Uploads sequenciais e associação
mantêm locks nas novas linhas de journal até commit, após lock de conta HTTP, com custo de conexão aberta durante I/O.
201 exige commit confirmado. Em falha ou resultado incerto, o estado durável
decide a recuperação; não há delete cego no catch.

`IMAGE_RECOVERY_ENABLED=true` habilita scheduler; `IMAGE_RECOVERY_INTERVAL=60000`
é intervalo/atraso inicial em milissegundos. `IMAGE_RECOVERY_SAFETY_DELAY=PT5M`
(mínimo PT2M) e `IMAGE_RECOVERY_BATCH_SIZE=20` (1–100) controlam elegibilidade/lote.
Valores também podem ser propriedades Spring. Compose usa esses defaults;
para overrides, transmitir explicitamente variáveis ao serviço backend.

R2 tem timeout total de 60 segundos, 25 segundos por tentativa e duas tentativas.
O recuperador bloqueia linhas elegíveis com SKIP LOCKED, confere ausência de
referência e executa DELETE idempotente. Falha mantém tombstone pendente de exclusão, contador,
DELETE_FAILED sem mensagem do provedor e backoff de 60 s até uma hora.
Após sucesso, TOMBSTONE é rechecado a cada hora indefinidamente: PUT com resposta
perdida pode terminar tardiamente no provedor. LINKED nunca é excluído. Estado e
próxima tentativa sobrevivem ao restart; banco/R2 indisponível adia recuperação.
Uma queda após DELETE e antes de commit repete DELETE com segurança.

Não prometer atomicidade absoluta. Monitorar contagem/idade de pendências e
last_error com consultas administrativas read-only ao journal. Não purgar
intenção/tombstone manualmente. Futuras exclusões devem coordenar o journal;
objetos ligados e tombstones exigem política de retenção explícita.

Para órfãos antigos, inventariar em modo read-only somente o prefixo autorizado
`occurrences/`, exportando keys/datas (sem bytes ou URLs públicas). Comparar com
`SELECT object_key FROM occurrence_media` e `SELECT image_key, state FROM
image_upload_journal` no mesmo ambiente; marcar candidatos para revisão humana.
Ausência de referência em uma fotografia pontual não autoriza exclusão: repetir
após janela segura e confirmar escopo/atividade. Esta entrega não varre bucket,
não apaga histórico e não altera objetos de outros projetos.

`UploadRecoveryTests` chama recuperação deterministicamente com Clock controlado
e PostgreSQL descartável; cobre rollback, commit com constraint diferida,
restart, retry, tombstone e lock de upload ativo. Doubles substituem R2; não
comprovam comportamento remoto. Ver ADR 0013.

## Descarte de relatos

Remoção/substituição/exclusão agenda todas as chaves retiradas como TOMBSTONE na mesma transação
que troca/remove a referência. O worker existente retoma após restart, com
backoff e tentativas limitadas por lote; não depende de callback em memória.
Vínculos só usam PENDING sob lock do journal; chaves não são reutilizadas.
Objetos referenciados são preservados. Falha registra apenas DELETE_FAILED em
last_error; conferir fila/next_attempt_at sem exportar bytes ou credenciais.
Não remover tombstones manualmente nem executar varredura de órfãos históricos.
Ver [ADR 0014](adr/0014-gerir-relatos-e-descarte-de-imagens.md).

## Mídia de vídeo

O [contrato de vídeo](occurrence-video.md) define a alternativa exclusiva a fotos,
validação FFprobe/FFmpeg, streaming/HEAD/Range e limites. Fotos mantêm seus limites.
Vídeo privado usa download Bearer limitado → Blob somente após EOF; público usa o
endpoint da aplicação sob demanda. Cards/mapas não baixam vídeo; `/image` em VIDEO
retorna 404. Cada request de mídia revalida acesso antes de HEAD/GET do storage e
encerra transação antes da cópia. Bucket permanece privado e bytes/metadados são
preservados. V14/runtime/worker atualizado precedem frontend; versões antigas
exigem parada coordenada, com recuperação por avanço em vez de desfazer migration.

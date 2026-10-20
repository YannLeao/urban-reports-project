# Fotografias de relatos: contrato e operação

Refs #52. Modo fotos: coleção ordenada de **1 a 5 fotos**; posição zero é capa em cards,
mapas e painéis. Galerias pública/própria/admin mostram a selecionada com navegação
por botões. Seleção incremental na galeria (`multiple`) e captura nativa compartilham
o mesmo conjunto; botões permitem mover, remover e definir capa por teclado/toque.
`ImagePicker` singular permanece apenas na prova local `/prova-imagem`.

## API e dados

V13 cria `occurrence_media` e retira `occurrences.image_key`. Cada mídia tem UUID,
tipo IMAGE, MIME e tamanho quando conhecidos, posição zero-based e endpoint
relativo da API para a superfície. Keys e nome original nunca saem do backend.
DTOs de consulta retornam `media` ordenado, no máximo cinco metadados por relato;
as consultas paginadas não usam join de coleção e carregam metadados em batches.
Tamanho legado é null; MIME também pode ser null se não houver evidência segura.
Nenhum GET/HEAD/PUT no provedor é feito pela migração.

POST multipart recebe `images` repetido, na ordem desejada, ou `image` legado
singular, sem mistura. Todos os demais campos mantêm seu contrato. Exemplo com
arquivos sintéticos, usando Bearer apenas em ambiente de teste autorizado:

```bash
curl --request POST "$API/api/occurrences" \
  --header "Authorization: Bearer $TEST_TOKEN" \
  --form 'categoryId=1' --form 'title=Poste apagado' \
  --form 'neighborhood=Centro' --form 'reference=Praça central' \
  --form 'latitude=0' --form 'longitude=0' \
  --form 'images=@synthetic-1.png;type=image/png' \
  --form 'images=@synthetic-2.png;type=image/png'
```

PUT exige If-Match com versão entre aspas e relato PENDING do autor. Sem manifesto
e sem arquivos, preserva **todas** as fotos. Havendo alteração, `media` é parte
application/json (até 8192 bytes), com o conjunto final:

```json
{"items":[{"id":"UUID-existente-a-manter"},{"uploadIndex":0}]}
```

```bash
curl --request PUT "$API/api/occurrences/$REPORT_ID" \
  --header "Authorization: Bearer $TEST_TOKEN" --header 'If-Match: "0"' \
  --form 'categoryId=1' --form 'title=Poste ainda apagado' \
  --form 'neighborhood=Centro' --form 'reference=Praça central' \
  --form 'media=@manifest.json;type=application/json' \
  --form 'images=@synthetic-new.png;type=image/png'
```

IDs devem pertencer ao relato. Repetição, campos desconhecidos/ambíguos, índice
inválido, arquivo novo não usado ou sem manifesto, zero/seis fotos e arquivos
inesperados são recusados (400 VALIDATION_ERROR). Entradas omitidas são removidas;
não omitidas são mantidas sem reupload. `image` legado em PUT só substitui uma
coleção singular; em coleção múltipla é recusado. Campos sem mídia continuam
compatíveis. Conflitos preservam contrato 409/412/428. Sucesso exige commit total.

Leitura individual: GET `/api/occurrences/{id}/media/{mediaId}` (autor),
`/api/admin/occurrences/{id}/media/{mediaId}` (ADMIN ativo) e
`/api/public/occurrences/{id}/media/{mediaId}` (visibilidade pública atual).
Pertencimento é conferido em todas. Mídia alheia ao relato resulta em 404 uniforme.
As três rotas `/image` continuam lendo a capa com mesma autorização. Rejeitados
não têm downloads públicos de nenhuma foto; bytes já baixados não são revogados.
Respostas mantêm no-store/nosniff. Storage técnico permanece bloqueado e R2 privado.
OpenAPI dev descreve partes/compatibilidade; base/prod continuam sem Swagger.

## Limites e falhas

- Cada arquivo: JPEG/PNG/WebP estático, 5.242.880 bytes; lados até 8192 e até
  25.000.000 pixels. Mesma validação estrutural/decoder existente no backend.
- `spring.servlet.multipart.max-file-size=26214400B`.
- `spring.servlet.multipart.max-request-size=27262976B` (26 MiB).
- `spring.servlet.multipart.file-size-threshold=0B` (spool em disco).
- `server.tomcat.max-swallow-size=28311552B` (27 MiB, finito).
- `server.tomcat.max-part-count=20`; `max-part-header-size=1024` bytes;
  `max-http-form-post-size=65536B`. Partes não fotográficas limitadas pela aplicação
  a 8192 bytes cada, além das regras dos campos. A sexta foto não é truncada.
- Excesso de bytes mantém 413 IMAGE_TOO_LARGE; multipart inválido mantém erro tratado; Tomcat classifica
  excesso de partes também como 413. Proxy/plataforma podem recusar antes da aplicação; confirmar
  seus limites/timeouts com o mantenedor, sem prometer envelope nesse caso.

Sem variáveis novas. As propriedades são finitas e fixadas no backend, também
usadas pela imagem Compose. `IMAGE_STORAGE_*` e `IMAGE_RECOVERY_*` permanecem iguais.
Cinco PUTs sequenciais têm até 300 s de orçamento acumulado do cliente R2, mais
validação/banco; locks e conexão permanecem durante I/O. Não é garantia de prazo
remoto. Dimensionar pool, memória, disco temporário e limites do Render/proxy.

Todas as fotos são validadas antes de subir qualquer arquivo. Falha no terceiro
PUT não confirma coleção parcial; todas as intenções permanecem recuperáveis.
Recovery verifica `occurrence_media.object_key`, inclusive segunda/quinta foto.
Remoção/troca/exclusão agenda tombstones na transação dos vínculos; reordenação
não faz PUT/DELETE. Worker desligado adia descarte até retomada; não remover
journals/tombstones manualmente, não varrer bucket e não prometer exclusão imediata.

**Os bytes originais, inclusive EXIF, continuam disponíveis na leitura pública.**
Decodificação e bucket privado não anonimizam. Sanitização é pendência concreta
para decisão do mantenedor; esta entrega não transforma nem reprocessa objetos.

## Validação local e roteiro manual

Executar com Java 21, Docker, Node 22.23.2 e pnpm 10.34.5, sem `.env` privado ou
provedores remotos. Os testes criam contas/chaves sintéticas e PostgreSQL descartável;
storage é fake. Não substituir os testes de HTTP real por MockMvc para limites.

```bash
cd backend
./mvnw verify
# Recorte de migração, falhas de PUT, commit, concorrência e relógio controlado:
./mvnw verify -Dtest=MediaMigrationTests,OccurrenceHttpTests,UploadRecoveryTests,AdminProvisioningIntegrationTests
cd ../frontend
pnpm install --frozen-lockfile
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

1. `MediaMigrationTests`: upgrade V12 com fotografia/journal antigos resulta em
   uma primeira mídia com mesma key, MIME inferido ou desconhecido e tamanho null;
   nenhuma operação remota. Banco limpo inicia com Hibernate validate.
2. Em ambiente local de teste autorizado, cadastrar cinco fotos sintéticas
   distintas; confirmar ordem/capa no próprio relato, público e fila administrativa.
   Cards/mapas devem solicitar só `/image`, sem baixar as cinco. Sexta ou arquivo
   inválido mostra erro e preserva a seleção; envio vazio não ocorre.
3. Editar mantendo duas existentes, adicionando uma e removendo/reordenando outras.
   Recarregar deve manter ordem/capa. Remover capa promove próxima. Network mostra
   só arquivos novos e manifesto completo. Em duas abas, salvar a primeira e tentar
   a segunda: esperar 412, rascunho mantido e consulta novamente disponível.
4. Navegar galeria com teclado, toque, 360 px e zoom 200%; conferir posição, prévia
   inteira, falha por foto, captura/cancelamento e retorno do foco ao remover.
   Uma foto não exibe controles duplicados. Câmera exige evidência de aparelho real.
5. Autor lê todas; outro USER recebe 404; anônimo recebe 401 nas privadas; ADMIN
   ativo lê pelo endpoint administrativo. ID de mídia com outro relato é 404.
   Rejeitar relato sintético: todas públicas passam a 404; autor/admin mantêm acesso.
6. Excluir um relato PENDING de teste: todas as fotos são agendadas. Testes com
   fake/Clock demonstram recuperação/restart, falhas e PUT tardio; não adulterar
   credenciais nem fazer DELETE manual em R2 para simular falha.

Este roteiro descreve **resultados esperados**, não homologação executada. Registrar
resultados datados, SHA, browser/aparelho e pipeline na MR/issue. Testes locais não
comprovam câmera física, R2 remoto, limites do proxy ou deploy.

## Publicação pelo mantenedor

1. Revisar MR/pipeline, confirmar versão livre V13 e backup/plano de recuperação
   do banco. Revisar limites de request, timeouts e espaço temporário no Render.
2. Parar **todas** as instâncias antigas do backend e seus schedulers/workers;
   impedir restart automático da versão anterior durante a migração.
3. Publicar backend novo: Flyway V13 migra referências e retira coluna antiga;
   Hibernate validate deve passar. Nenhum objeto precisa ser copiado/regravado.
   Não executar workers antigos depois disso. Rollback binário antigo é incompatível.
4. Publicar frontend novo via job manual existente da branch protegida, após a API.
   Clientes antigos continuam POST singular e capa; PUT singular só em relato singular.
5. Conferir variáveis `IMAGE_STORAGE_ENDPOINT`, `IMAGE_STORAGE_REGION`, bucket e
   credenciais privadas já existentes, sem exportar valores em evidência. Confirmar
   bucket privado, sem domínio público/r2.dev, e configuração `IMAGE_RECOVERY_ENABLED`.
6. No ambiente publicado, mantenedor testa somente mídias/contas sintéticas ou
   autorizadas: cadastro com cinco, edição/reordenação, permissão por mídia,
   rejeição, galeria na Vercel e descarte eventual autorizado. Não testar objetos
   de terceiros, inventariar bucket ou atribuir homologação a configuração existente.

## Vídeo

A coleção foi ampliada para fotos **OU** um vídeo por [contrato próprio](occurrence-video.md).
Este guia continua descrevendo a galeria de fotos. No modo vídeo, `/image` retorna
404, cards/mapas usam placeholder, o detalhe privado baixa Blob sob demanda e o
público usa streaming/HEAD/Range. Multipart permite 25 MiB por arquivo, mantendo
5 MiB para fotos na aplicação. API/schema V14 e workers devem preceder o frontend;
veja o roteiro de publicação coordenada no contrato de vídeo.

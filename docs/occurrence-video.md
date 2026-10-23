# Fotos ou vídeo no relato

A coleção é exclusiva: **1–5 fotografias ou exatamente um vídeo**, sem poster
artificial. V14 evolui V13, preservando IDs, posições, keys e metadados nulos
legítimos das fotos. Nenhuma migration consulta o provedor. Um trigger diferido
verifica cardinalidade/XOR no commit, serializando a conferência pelo relato;
pertencimento de mídia existente é imutável. `ddl-auto=validate` permanece.

## Contrato

Vídeo: MP4 autocontido, não criptografado, MIME `video/mp4`, até **26.214.400 bytes**,
duração positiva até 30 s, uma trilha H.264 progressiva, `yuv420p`, perfis Baseline,
Constrained Baseline, Main ou High, level até 4.1. Até 1280×720 ou 720×1280 e
921.600 pixels, verificando dimensões codificadas, SAR e orientação em múltiplos
de 90°. Áudio opcional: uma trilha AAC-LC, 1–2 canais, até 48 kHz. Nenhuma trilha
adicional. MOV/HEVC/HDR/High10/WebM/VPx/AV1, referência externa e mídia truncada
são recusados. Captura nativa e extensão de arquivo não garantem aceitação.

Fotos preservam JPEG/PNG/WebP estático e **5.242.880 bytes por arquivo**. Multipart
usa 26.214.400 B por parte, 27.262.976 B no total, spool em disco, 20 partes,
1024 B por header de parte, formulário Tomcat 65.536 B e partes não binárias até
8192 B. Swallow é finito: 28.311.552 B. Limites do proxy continuam independentes.

POST recebe `images` repetido/`image` singular legado **ou** uma parte `video`.
Partes desconhecidas, duplicadas ou misturadas são inválidas. PUT usa `media`
application/json: `{"items":[{"uploadIndex":0}]}` para substituir por vídeo;
para fotos, cada índice corresponde ao `images` novo. `{id}` mantém mídia do
próprio relato. Todos os uploads são usados exatamente uma vez. Manifesto final
não pode misturar tipos. Sem arquivos/manifesto, preserva toda a coleção.
`image` legado só substitui uma foto; nunca vídeo. Autor/PENDING/If-Match,
versões, histórico e notificações mantêm seus contratos.

DTOs discriminam `type: IMAGE|VIDEO`; vídeo traz MIME, tamanho medido,
`durationSeconds`, `width`, `height`, posição zero e endpoint relativo por mídia.
Nunca traz key, bucket, nome original ou URL assinada. `/image` em vídeo retorna
404 `IMAGE_NOT_FOUND`; consumidores usam o discriminador para não solicitá-lo.
Consultas continuam carregando coleções em batches, sem buscar bytes do storage.

## Validação e recursos

FFprobe fornece somente campos técnicos permitidos; outra passagem decodifica
frames e verifica dimensões, pixel format, entrelaçamento, contagem e timestamps.
FFmpeg executa decode estrito de vídeo/áudio **até EOF**, sem transcodificar,
remux, faststart ou extração de capa. Não usamos `-t` nem limite de frames para
aprovar leitura parcial. Aceite exige todas as passagens completas.

Há no máximo 900 frames de vídeo. Quando o MP4 declara a contagem de amostras,
ela deve coincidir com todos os frames decodificados; timelines editadas que
ocultem amostras de vídeo são recusadas. Taxas declaradas e intervalos observados não
podem exceder 30 fps: intervalo mínimo 1/30 s com 2 µs para arredondamento decimal;
duração observada aceita até 30 s + 2 µs, declarada até 30 s + 1 µs. A consistência
entre duração de container e frames admite 50 ms (diferença de timebases/áudio),
**sem ampliar o teto absoluto de 30 s**. Saída de frames fica limitada a 1 MiB;
metadados a 32 KiB, inventário inicial de decoders a 128 KiB e stderr a 32 KiB por processo, além dos limites de contagem.

Uma vaga por instância é adquirida sem fila **antes da cópia temporária** e
permanece ocupada até terminar o upload/commit e remover a cópia. A cópia mede
bytes reais com buffer de 16 KiB e interrompe em 25 MiB + 1. Um filtro após Security e antes da resolução multipart admite no máximo duas
requisições multipart, sem fila, inclusive subtipos/URLs que depois serão recusados; excesso recebe 503 MEDIA_BUSY antes de criar partes.
A vaga é liberada após o cleanup multipart. O teto de spool HTTP é assim 52 MiB,
mais uma cópia validada de até 25 MiB e temporários do runtime. Reservar pelo menos
128 MiB de disco temporário com quota no ambiente da API; a sonda isolada usa
64 MiB por não executar o parser servlet. Limites do proxy e sockets permanecem
independentes.

`VIDEO_VALIDATION_TIMEOUT_SECONDS=30` mapeia
`video.validation.timeout-seconds`; aceita inteiros 1–30 e limita conjuntamente
probe, inspeção de frames e decode. Uma thread nativa por decoder/filtro e
`max_alloc=33554432` limitam trabalho/alocações individuais, **não a memória total**.
ProcessBuilder usa argumentos fixos, caminhos temporários gerados pelo servidor,
sem shell, ambiente limpo (somente LC_ALL), stdin fechado, protocolos file/pipe e
demuxer MOV com drefs/absolute paths desativados. Uma inspeção BMFF limitada
recusa brands não MP4, amostras de outro codec, referências externas e estruturas
de criptografia antes dos processos. Isso não constitui sandbox de sistema
operacional, antivírus ou sanitização de metadados.

Timeout/interrupção/shutdown encerram os processos e descendentes, fecham pipes
e preservam interrupção. Falhas limpam temporários e liberam capacidade.

| HTTP | Código / significado |
| --- | --- |
| 400 | INVALID_VIDEO: arquivo fora do contrato |
| 400 | VALIDATION_ERROR: partes/manifesto/campos inválidos |
| 413 | VIDEO_TOO_LARGE: cópia acima de 25 MiB |
| 413 | IMAGE_TOO_LARGE: transporte multipart ou foto acima de 5 MiB (código legado) |
| 503 | VIDEO_VALIDATION_UNAVAILABLE: ferramenta, prazo ou infraestrutura indisponível |
| 503 | VIDEO_VALIDATION_BUSY: vaga ocupada; repetir por ação do usuário |
| 503 | MEDIA_BUSY: capacidade de envio/reprodução ocupada |
| 502 | IMAGE_STORAGE_UNAVAILABLE: provedor indisponível (código legado) |

As mensagens não expõem processo, caminho, tags, saída nativa ou exceção do
provedor. Não ativar wire logs. Fotos não executam ferramentas de vídeo.

## Journal e reprodução

Upload usa a cópia seekable, tamanho medido e InputStream, sem array integral
ou buffering de tamanho desconhecido no SDK. Intenção precede PUT. Ordem de locks:
conta → novos journals ordenados → relato → keys retiradas ordenadas. O snapshot inicial de edição usa uma transação curta com conta → relato para
ler versão e coleção consistentemente; esses locks são liberados antes da
validação. Validação nativa precede os locks de intenção/upload. Troca/exclusão agenda todas as retiradas no commit;
falha preserva o conjunto anterior e deixa novas intenções recuperáveis. Não há
delete cego nem atomicidade distribuída. Recovery já consulta todas as referências
de `occurrence_media`, inclusive VIDEO, e preserva reavaliação de PUT tardio.

GET/HEAD `/api/{public|admin}/occurrences/{id}/media/{mediaId}` e
`/api/occurrences/{id}/media/{mediaId}` conferem visibilidade/autor/ADMIN ativo,
sessão e pertencimento **antes** do storage. A transação termina antes de HEAD,
GET e cópia. Cada novo Range revalida acesso; bytes já entregues não são revogados.

- GET sem intervalo: 200, `video/mp4`, tamanho real.
- HEAD: 200 e metadados, sem GET do corpo; ignora Range.
- Range único fechado/aberto/sufixo: 206, Content-Range e tamanho parcial.
- Intervalo válido insatisfazível: 416, `Content-Range: bytes */N`, sem GET.
- Header malformado, unidade desconhecida, múltiplos intervalos ou maior que
  128 caracteres: ignorado, GET 200. Aritmética não sofre overflow.
- If-Range sempre causa GET completo: não anunciamos validador suportado.
- `Accept-Ranges: bytes`, `Cache-Control: no-store`, `nosniff`. CORS permite
  Range/If-Range e expõe somente Accept-Ranges/Content-Range adicionais.

A instância admite quatro operações de vídeo (HEAD/aquisição/cópia) sem espera;
quatro threads de cópia e fila finita de quatro cobrem a entrega ao executor.
O corpo usa buffer de 16 KiB, async servlet de 30 s e
`server.tomcat.connection-timeout=20s`, aplicado pelo conector NIO a leituras e
escritas bloqueantes do socket. Timeout/desconexão abortam
a origem e encerram o async; falha após início não anexa JSON. Slots de cópia
permanecem ocupados até sair do worker, evitando admitir trabalho ilimitado se
um transporte bloquear. Shutdown aborta fontes ativas. O cliente Apache limita
a oito conexões, aquisição 2 s, conexão 5 s e leitura inativa 5 s. Mantém os
orçamentos existentes do SDK de 60 s totais/25 s por tentativa/duas tentativas;
HEAD e aquisição do GET precedem o prazo async. `abort()` evita drenagem do objeto
restante no cliente Apache. Os prazos async e de I/O do socket são independentes; timeout async não
garante encerramento físico instantâneo, e limites do proxy dependem do ambiente.

No detalhe privado, clique inicia fetch Bearer com AbortSignal e leitura limitada
em andamento; somente após receber tudo cria Blob/object URL. O vídeo inteiro
carrega antes de tocar. Troca de conta/relato/mídia e desmontagem abortam leitura,
limpam player e revogam URL. Não há cache persistente nem token em URL. Público
aponta, após clique, ao endpoint da aplicação para Range nativo do navegador.
Players usam controls/playsinline/preload=none, sem autoplay. Cards/mapas mostram
placeholder com ícone/duração e não pedem MP4 ou `/image` para VIDEO.

**Bytes originais são preservados, inclusive possíveis tags/localização.**
Decode e bucket privado não anonimizam. Sem compatibilidade universal de câmera,
transcodificação, poster, CDN, URLs assinadas ou HLS/DASH/MSE. O [Wizard atual](report-wizard.md)
integra mídia em uma entrada visual com menu curto Fotografar/Gravar vídeo e Galeria.
Entradas nativas específicas solicitam capture=environment, inclusive vídeo; o
navegador/aparelho decide o caminho efetivo. Não há gravador próprio nem garantia
de MP4 H.264 pela câmera. MOV/HEVC e lotes mistos/múltiplos vídeos são recusados
localmente; integridade/codec/duração completos continuam sendo validados no servidor.
Troca de tipo válido pede confirmação, cancelamento preserva o conjunto anterior.
Seleção nunca muda etapa; Continuar é explícito. Restrições completas ficam em
Formatos e limites; nenhum input nativo visível impõe largura ao layout.

## Runtime, validação local e roteiro manual

Imagem final: Temurin Java 21 JRE sobre Alpine 3.24, pacote `ffmpeg` do repositório
Alpine (inclui ffprobe), instalado no build antes de USER app. A base 3.24 mantém
o [suporte regular de community](https://alpinelinux.org/releases/) necessário ao pacote;
o suporte remanescente de main na base anterior 3.22 não cobre community. A variante efetiva
deve ser conferida na imagem; FFmpeg GPL e bibliotecas habilitadas seguem as
[licenças do projeto](https://ffmpeg.org/legal.html) e do pacote Alpine. No host,
instalar FFmpeg/FFprobe em `/usr/bin` pelo gerenciador da distribuição, com
H.264 e AAC habilitados. O binário Alpine validado declara GPL versão 3 ou
posterior; conferir `ffmpeg -L` e as licenças das bibliotecas habilitadas. Ausência gera 503 apenas quando validar vídeo. O job `backend:test` instala
FFmpeg/FFprobe pelo apt da imagem Maven antes de executar a suíte real; não
substitui nem dispensa a sonda da imagem final Alpine.

```bash
# Na raiz; sem provedores ou segredos.
docker build -t urban-reports-backend:occurrence-video backend
docker run --rm --entrypoint /usr/bin/ffmpeg urban-reports-backend:occurrence-video -version
docker run --rm --entrypoint /usr/bin/ffprobe urban-reports-backend:occurrence-video -version
docker run --rm --entrypoint /usr/bin/ffmpeg urban-reports-backend:occurrence-video -decoders
# Verificar h264 e aac, e restrições reais do demuxer:
docker run --rm --entrypoint /usr/bin/ffprobe urban-reports-backend:occurrence-video -h demuxer=mov
cd backend
JAVA_HOME=/caminho/jdk21 ./mvnw -Dspring.config.import= verify
cd ../frontend
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

A sonda abaixo usa classes/fixtures sintéticas compiladas pelo Maven, sem iniciar
Spring, importar .env, conectar banco ou provedor. Não monta diretórios privados.

```bash
docker run --rm --network none --read-only --memory=512m --cpus=1 --pids-limit=128 \
  --tmpfs /tmp:size=64m,mode=1777 \
  --volume "$PWD/backend/target/test-classes:/probe:ro,Z" \
  --entrypoint java urban-reports-backend:occurrence-video \
  -Xmx256m -Dloader.path=/probe \
  -Dloader.main=com.project.software.urbanreports.occurrence.VideoRuntimeProbe \
  -cp /app/app.jar org.springframework.boot.loader.launch.PropertiesLauncher
```

Gerar MP4 sintético com FFmpeg que tenha libx264 (a imagem final tem):

```bash
ffmpeg -nostdin -f lavfi -i color=c=blue:s=1280x720:r=30 \
  -f lavfi -i sine=frequency=440:sample_rate=48000 -t 5 \
  -c:v libx264 -threads 1 -profile:v main -level:v 4.1 -pix_fmt yuv420p \
  -c:a aac -ac 1 -ar 48000 synthetic.mp4
# Sem áudio: omitir o segundo input e usar -an; retrato: s=720x1280.
```

Se o host não tiver libx264, gere pelo binário da imagem sem rede e monte somente
um diretório sintético (não monte o checkout ou arquivos pessoais):

```bash
mkdir -p /tmp/urban-video-fixtures
docker run --rm --network none --memory=512m --cpus=1 \
  --user "$(id -u):$(id -g)" \
  --volume /tmp/urban-video-fixtures:/fixtures:Z \
  --entrypoint /usr/bin/ffmpeg urban-reports-backend:occurrence-video \
  -nostdin -f lavfi -i color=c=blue:s=1280x720:r=30 \
  -f lavfi -i sine=frequency=440:sample_rate=48000 -t 5 \
  -c:v libx264 -threads 1 -profile:v main -level:v 4.1 -pix_fmt yuv420p \
  -c:a aac -ac 1 -ar 48000 /fixtures/synthetic.mp4
```

Em ambiente local com contas sintéticas e storage controlado:

1. Criar com vídeo. Esperar PENDING, VIDEO/duração/dimensões no DTO, placeholder
   nos cards/mapa e nenhum download até clicar no detalhe. Testar próprio, ADMIN
   ativo e público. Privado carrega inteiro, público permite seek por Range.
2. Criar 1 e 5 fotos; editar PENDING fotos → vídeo → fotos. Cancelar confirmação
   preserva seleção; falha/412 preserva rascunho e mídia salva; sucesso troca toda
   a coleção e agenda retiradas. Reordenação de fotos continua funcionando.
3. Repetir arquivo, misturar partes, enviar MOV/HEVC/truncado, mais de 30 s/720p/
   30 fps/25 MiB e foto acima de 5 MiB. Esperar recusa sem upload indevido. Em
   teste controlado, ausência de decoder e vaga ocupada são 503 recuperáveis.
4. Com ID sintético público e variável MEDIA_URL apontando ao **servidor local
   controlado**, conferir bytes/headers (não inserir Bearer real no histórico):

   ```bash
   curl -I "$MEDIA_URL"
   curl -i -H 'Range: bytes=0-15' "$MEDIA_URL"
   curl -i -H 'Range: bytes=-16' "$MEDIA_URL"
   curl -i -H 'Range: bytes=999999999-' "$MEDIA_URL"
   curl -i -H 'Range: bytes=0-1,3-4' "$MEDIA_URL"
   curl -i -H 'If-Range: unsupported' -H 'Range: bytes=0-15' "$MEDIA_URL"
   ```

   Esperar respectivamente 200 sem corpo, 206, 206, 416 sem GET de origem,
   200 completo e 200 completo. Asserts de bytes exatos, ausência de transação e
   limites estão nos testes HTTP/fake; configuração não prova comportamento R2.
5. Logout/troca de conta durante download removem vídeo anterior; outra conta
   não lê mídia privada. Rejeitar relato bloqueia novos GET/HEAD/Range públicos.
6. Teclado/foco do diálogo, 360 px/desktop e zoom 200%; erro do player permite
   repetir. Registrar navegador e aparelho realmente utilizados. Chrome/Edge/
   Firefox desktop, Chrome Android e Safari iOS são a matriz de homologação;
   aparelhos ausentes permanecem pendentes.

## Publicação e recuperação pelo mantenedor

Revisar pipeline/MR, disponibilidade de V14, backup e recursos temporários antes
de publicar. Parar todas as versões anteriores e workers para impedir que leiam
MP4 como imagem ou tentem operar com contrato antigo. Publicar primeiro API/schema
V14/runtime FFmpeg/worker atualizado, verificar validate e health, depois publicar
o bundle frontend pelo job manual existente. Não desfazer migration aplicada;
rollback binário com vídeos não é seguro: recuperar por avanço, ou realizar
parada coordenada com plano próprio de restauração. Não reprocessar objetos.

A única variável nova é `VIDEO_VALIDATION_TIMEOUT_SECONDS` (default 30, 1–30).
Configurar capacidade CPU/memória/disco e conferir limites do proxy/Render antes
do aceite. R2 continua privado com as variáveis atuais e mesmo journal;
`IMAGE_RECOVERY_ENABLED` mantém seu significado. Credenciais nunca entram no
frontend. A base VITE_API_URL continua incorporada no build e exige recompilação.

Após publicação, o mantenedor homologa upload/timeout/seek/abort, áudio/sem áudio,
retrato, Blob privado e Range público no Render/Vercel e bucket privado autorizado.
Não adulterar credenciais para provocar falha. Registrar resultados na MR/issue;
testes locais e suporte documentado de HeadObject/GetObject Range não comprovam
R2 ou produção. Fontes: [FFprobe](https://ffmpeg.org/ffprobe.html),
[demuxer MOV](https://ffmpeg.org/ffmpeg-formats.html#mov_002fmp4_002f3gp),
[AWS ResponseInputStream](https://docs.aws.amazon.com/java/api/latest/software/amazon/awssdk/core/ResponseInputStream.html),
[R2 S3](https://developers.cloudflare.com/r2/api/s3/api/).

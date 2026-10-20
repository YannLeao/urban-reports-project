# Recursos e operação do PDF administrativo

O backend usa PDFBox **3.0.8** ([release oficial](https://pdfbox.apache.org/download.cgi),
[dependências](https://pdfbox.apache.org/3.0/dependencies.html)), Apache-2.0.
Dependências necessárias: pdfbox, pdfbox-io e fontbox 3.0.8, também Apache-2.0.
A exclusão de commons-logging na dependência PDFBox mantém a versão já resolvida
por Spring Core 7 (commons-logging 1.3.6, Apache-2.0); Spring 7 não usa o antigo
spring-jcl. Nenhuma extensão opcional de imagem, assinatura ou criptografia foi
adicionada. A dependência Bouncy Castle anterior permanece pelo contrato de auth.

## Fontes e marca

`backend/src/main/resources/report-pdf/` integra o JAR e o contexto Docker backend:

- `Figtree-Regular.ttf` e `Figtree-Bold.ttf`: TrueType estáticas do projeto
  oficial [Figtree](https://github.com/erikdkennedy/figtree), obtidas dos caminhos
  `fonts/ttf/Figtree-Regular.ttf` e `fonts/ttf/Figtree-Bold.ttf` da branch master.
  [Regular](https://raw.githubusercontent.com/erikdkennedy/figtree/master/fonts/ttf/Figtree-Regular.ttf),
  [Bold](https://raw.githubusercontent.com/erikdkennedy/figtree/master/fonts/ttf/Figtree-Bold.ttf).
  A reprodução deve conferir os hashes versionados, pois master pode mudar.
- `OFL.txt`: licença oficial SIL OFL 1.1 e copyright dos autores Figtree, copiados
  integralmente da [origem](https://raw.githubusercontent.com/erikdkennedy/figtree/master/OFL.txt).
  Fontes sem alterações, incorporadas/subset por documento. Não são WOFF2 ou
  fontes do SO, nem downloads por request.
- `brand.png`: PNG transparente 256×256 derivado de `frontend/public/favicon.svg`
  (asset oficial MIT do projeto); não é nova marca. Corpo, tabelas e barras
  permanecem texto/vetores.
- `brand.properties`: cores semânticas e SHA-256 de tokens, SVG, PNG, TTF e licença.
  Gerado/verificado pelo script TypeScript strict `frontend/scripts/report-pdf-assets.ts`.

Preparação somente no desenvolvimento, na raiz (ImageMagick 7):

```bash
magick -background none frontend/public/favicon.svg -resize 256x256 \
  backend/src/main/resources/report-pdf/brand.png
node frontend/scripts/report-pdf-assets.ts
# Revisar recursos e hashes; a checagem não escreve nem baixa nada:
(cd frontend && pnpm run report-pdf:assets:check)
```

A checagem detecta alterações nas entradas e nos bytes finais. Não comprova sozinha
que um PNG novo foi desenhado corretamente: revisar a derivação e renderizar o PDF.
Não atualizar hashes para aceitar divergência sem conferir a origem. A geração
Java não precisa de Node, ImageMagick, assets frontend ou fontes instaladas no SO.

## Contrato operacional e limites

Uma vaga por instância, liberada em finally após leitura/renderização; não há fila
interna ilimitada. A conexão do snapshot já foi devolvida antes do desenho. O
arquivo é entregue em memória, sem spool/disco/storage de aplicação. Limites
iniciais no renderer: 512 páginas, saída de 16 MiB e verificações cooperativas de
30 s no layout. Não é timeout preemptivo de SQL, serialização ou download.
O cliente lê até EOF e recusa >16 MiB, tipo incorreto, arquivo vazio ou estrutura
básica inválida. Marcadores não equivalem a um validador PDF completo.

Excesso/capacidade ocupada: 503 `REPORT_PDF_CAPACITY`. Banco: 503
`ADMINISTRATION_UNAVAILABLE`. Recurso local ausente/corrompido ou falha inesperada:
500 `INTERNAL_ERROR`. Sempre JSON sanitizado/no-store antes do sucesso, sem PDF
parcial. Nunca truncar grupos ou transformar falha em dados zerados.

Essas proteções limitam saídas e concorrência de geração, não o heap total.
Agregações e lista de localidades ainda crescem com a população; PDFBox guarda
estruturas por página e a saída tem cópia ao finalizar. Downloads já gerados
podem coexistir com nova geração. O limite do container/JVM, pool HTTP/DB e
capacidade real precisam de medição no alvo. A medição sintética local não
representa capacidade do Render nem tempo de consulta ao PostgreSQL remoto.

Para medir somente renderer/admissão na imagem final, use o probe sintético
`backend/src/test/java/.../occurrence/ReportPdfProbe.java` (sem Spring/DB/rede).
Após `./mvnw verify`, extraia o JAR executável e compile o probe com Java 21:

```bash
mkdir -p backend/target/pdf-runtime
(cd backend/target/pdf-runtime && jar xf ../urban-reports-0.0.1-SNAPSHOT.jar)
javac -cp 'backend/target/pdf-runtime/BOOT-INF/classes:backend/target/pdf-runtime/BOOT-INF/lib/*' \
  -d backend/target/test-classes \
  backend/src/test/java/com/project/software/urbanreports/occurrence/ReportPdfProbe.java
docker build -t urban-reports-backend:administrative-pdf backend
# Caminho absoluto do checkout; sem .env, porta ou rede:
docker run --rm --network none --memory 512m \
  --mount "type=bind,src=$PWD/backend/target,dst=/probe,readonly" \
  --entrypoint java urban-reports-backend:administrative-pdf \
  -Xmx256m -Djava.awt.headless=true \
  -cp '/probe/test-classes:/probe/pdf-runtime/BOOT-INF/classes:/probe/pdf-runtime/BOOT-INF/lib/*' \
  com.project.software.urbanreports.occurrence.ReportPdfProbe 5000
```

O probe reporta Java/usuário/headless, páginas, bytes, tempo, heap observado,
picos por pool e VmHWM quando disponível; também exige recusa 503 de uma segunda
geração concorrente. Pools têm picos independentes, não devem ser somados como
um pico global simultâneo. Não instala fontes do SO. As classes/recursos extraídos
são os do JAR empacotado; só o probe vem de test-classes.

## Publicação

Depois de revisão e autorização, publicar backend com dependência/recursos antes
do frontend. Não há variáveis novas, segredos, migrations, R2 ou serviço adicional.
Preservar fluxo manual GitLab/Render/Vercel. Validar PDF headless no runtime final,
headers/autorização, download em navegador/celular e consumo de memória no alvo.
Não declarar homologação remota a partir de configuração ou medição local.

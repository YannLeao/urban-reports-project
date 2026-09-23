# Prova técnica de armazenamento de imagens

Este guia descreve a integração técnica com um bucket privado do Cloudflare R2. Os endpoints não representam o fluxo definitivo de ocorrência e
não criam registros no PostgreSQL.

A [prova de seleção e captura no frontend](image-selection-proof.md) em
`/prova-imagem` mantém a imagem apenas em memória e não utiliza estes endpoints.

## Contrato técnico

- Upload: `POST /api/storage/images`, `multipart/form-data`, campo `file`.
- Recuperação: `GET /api/storage/images/{id}`.
- Formatos aceitos: JPEG (`image/jpeg`), PNG (`image/png`) e WebP
  (`image/webp`).
- Limite da regra: 5 MiB por arquivo (5 × 1024 × 1024 = 5.242.880 bytes).
- Key interna: `proofs/{UUID}.{extensão-validada}`.
- Identidade devolvida: `UUID.extensão`, sem nome original, bucket ou URL do R2.

O MIME informado pelo cliente e a assinatura do conteúdo são validados. O nome
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

## Executar a prova manual

Com PostgreSQL disponível e a partir de `backend/`, inicie a aplicação:

```bash
./mvnw spring-boot:run
```

Envie uma imagem real permitida:

```bash
curl --include \
  --form 'file=@/caminho/foto.webp;type=image/webp' \
  http://localhost:8080/api/storage/images
```

A resposta deve ser `201 Created`, com `Location` e corpo semelhante a:

```json
{
  "id": "11685dfa-3a68-4827-a61a-0d6436cb82ca.webp",
  "url": "/api/storage/images/11685dfa-3a68-4827-a61a-0d6436cb82ca.webp"
}
```

Guarde o `id`, recupere o arquivo e compare-o com o original:

```bash
curl --fail \
  --dump-header /tmp/urban-reports-image.headers \
  --output /tmp/urban-reports-image.webp \
  http://localhost:8080/api/storage/images/SEU_ID.webp

sha256sum /caminho/foto.webp /tmp/urban-reports-image.webp
```

Os hashes devem ser iguais e o header deve conter `Content-Type: image/webp`.
Confirme também no painel ou na API do R2 que existe um objeto sob `proofs/` e
que ele não possui acesso público.

Interrompa e inicie novamente o backend, repita o `GET` com o mesmo identificador
e confirme bytes e tipo. Isso demonstra que o objeto não dependia do filesystem
da aplicação.

Por fim, tente um arquivo de outro formato, conteúdo disfarçado e um arquivo
maior que 5 MiB; todos devem ser rejeitados antes do envio ao bucket. O Swagger
em `http://localhost:8080/swagger` também documenta os dois endpoints técnicos,
mas exige iniciar explicitamente com
`./mvnw spring-boot:run -Dspring-boot.run.profiles=dev`. Os comandos curl acima
funcionam independentemente da documentação; não é necessário habilitá-la
em produção.

## Testes automatizados

```bash
cd backend
./mvnw test
```

A suíte usa um fake em memória de `ImageStorage` para uploads e recuperações.
Ela não lê credenciais, não acessa a Cloudflare e não exige internet. Docker
continua necessário apenas para os testes preexistentes de PostgreSQL/Flyway.

## Limites deliberados

Esta prova não implementa ocorrência, usuário, autenticação, tabela de imagem,
migration V2, URL pública/assinada, transformação, moderação ou remoção de EXIF.
A referência será ligada ao domínio somente quando `Occurrence` for modelada.

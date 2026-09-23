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

## Acesso HTTP bloqueado

A base de segurança bloqueia estes endpoints em todos os perfis, inclusive dev.
O roteiro anterior de upload público não funciona mais: POST sem CSRF válido
retorna 403; GET sem identidade retorna 401. Mesmo com CSRF válido, o upload
continua negado. Configurar R2 não altera essa política e não há login temporário.
A #36 definirá o contrato autorizado. Não envie imagem real para provar bloqueio.

Para verificar localmente, sem acessar objeto de terceiros:

```bash
curl --include http://localhost:8080/api/storage/images/00000000-0000-0000-0000-000000000000.png
curl --include --request POST http://localhost:8080/api/storage/images
```

Espere 401 JSON no GET e 403 JSON no POST. O contrato técnico acima permanece
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

## Limites deliberados

Esta prova não implementa ocorrência, usuário, autenticação, tabela de imagem,
migration V2, URL pública/assinada, transformação, moderação ou remoção de EXIF.
A referência será ligada ao domínio somente quando `Occurrence` for modelada.

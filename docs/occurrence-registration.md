# Registro autenticado de ocorrência

## Contrato HTTP

`GET /api/occurrence-categories` exige sessão válida e retorna as oito categorias
semeadas na V4 (`id`, `name`). `POST /api/occurrences` exige Bearer com sessão
válida e `multipart/form-data`. A rota frontend é `/registrar-ocorrencia`.

| Parte obrigatória | Regra |
| --- | --- |
| categoryId | Inteiro de uma categoria existente |
| title | 5–100 pontos de código |
| description | 20–1000 pontos de código |
| neighborhood | 2–100 pontos de código |
| reference | 5–200 pontos de código |
| image | Um arquivo não vazio, segundo as regras abaixo |

Campos textuais recebem trim externo ASCII (U+0009–U+000D e U+0020), sem mudar
espaços internos. Java, TypeScript e `char_length` PostgreSQL contam pontos de
código, inclusive emojis; NUL/UTF-16 inválido não são aceitos. Cada parte
obrigatória deve ocorrer exatamente uma vez. Arquivos em outros campos,
arquivos extras e image repetida são recusados, inclusive `filename=""`.
Nome vazio não transforma arquivo em campo textual. Campos textuais extras são
ignorados; autoria/status forjados nunca alteram a persistência.

O servidor deriva autor da `AuthenticatedIdentity`, gera a key
`occurrences/{UUID}.{extensão}` e mantém status técnico `PENDING` (Pendente).
201 retorna id, categoryId/categoryName, title, description, neighborhood,
reference, status e createdAt. Não retorna Location: ainda não há GET público de
ocorrência. Não expõe bucket, URL do provedor ou nome original do arquivo.

## Imagens

- JPEG (`image/jpeg`), PNG (`image/png`) e WebP (`image/webp`), até **5 MiB
  (5.242.880 bytes), inclusive**.
- Cada lado tem no máximo **8192 pixels**; largura × altura tem no máximo
  **25.000.000 pixels**, conferidos antes de alocar pixels decodificados.
- Apenas fotografia estática: APNG, WebP animado e múltiplos frames são recusados.
- Estrutura, MIME versus formato detectado e leitura dos pixels são obrigatórios.
  Arquivos truncados, assinatura fabricada, CRC PNG inválido e warnings de
  recuperação do decoder são recusados. O navegador é apenas uma pré-validação.
- Os bytes são preservados. Não há corte, rotação, reencode, remoção de EXIF,
  anonimização ou promessa de proteção completa contra conteúdo malicioso.

O [ADR 0012](adr/0012-validar-conteudo-e-limites-de-imagens.md) define leitor WebP,
orçamento de I/O e limitações de CPU/concorrência. A mensagem de erro do campo
image explica resolução excessiva e a restrição a imagens estáticas.

## Transporte e erros

`max-file-size=5242880B`, `max-request-size=6291456B` (6 MiB), deixando espaço
para os campos e overhead de uma fotografia no limite. Tomcat descarta no máximo
7 MiB de corpo rejeitado para entregar o erro perto do limite sem reset prematuro.
Corpos arbitrariamente maiores podem ter a conexão encerrada; não há descarte
ilimitado de dados. A aplicação não substitui limites do proxy de produção.

| HTTP | Situação / code |
| --- | --- |
| 201 | Ocorrência criada |
| 400 | Campos/partes/conteúdo inválidos: VALIDATION_ERROR e fieldErrors |
| 400 | Multipart malformado: INVALID_REQUEST |
| 401 | Sessão ausente, expirada ou revogada; nenhuma tentativa de upload |
| 413 | Limite multipart excedido, inclusive antes do controller: IMAGE_TOO_LARGE |
| 502 | Falha de storage: IMAGE_STORAGE_UNAVAILABLE |

Os erros tratados usam timestamp/status/error/message/path/code e fieldErrors
quando aplicável; não incluem bytes, credenciais ou exceções do provedor.
A cadeia de segurança permanece ativa e os endpoints técnicos de storage
permanecem bloqueados. Ver [segurança](security.md).

## Verificação local

Em backend/, JDK 21 e Docker: `./mvnw verify`.
`OccurrenceHttpTests` usa servidor embutido, multipart bruto, cadastro/login HTTP,
JWT e sessões reais, PostgreSQL descartável e fake de ImageStorage. Cobre
categorias/V4, persistência/autor/status, Unicode, limites, partes repetidas,
nome vazio, conteúdo inválido, erros e ausência/expiração/revogação de sessão.
`ImageContentValidationTests` exercita fixtures sintéticas reais, animações,
truncamentos e os limites de resolução. Não acessam R2.

Após verify e build de `backend/Dockerfile`, execute a sonda sobre a imagem final,
a partir da raiz (o mount contém apenas classes/fixtures de teste):

```bash
docker run --rm --memory=512m --cpus=1 \
  --volume "$PWD/backend/target/test-classes:/probe:ro,Z" \
  --entrypoint java urban-reports-backend:upload-validation \
  -Xmx384m -Djava.awt.headless=true \
  -Dloader.path=/probe \
  -Dloader.main=com.project.software.urbanreports.storage.application.ImageDecoderRuntimeProbe \
  -cp /app/app.jar org.springframework.boot.loader.launch.PropertiesLauncher
```

Frontend usa versões fixadas: instalação frozen, lint, typecheck, test,
tokens:check e build conforme [guia](frontend-development.md). Os testes do
contrato textual verificam limites Unicode; não comprovam o formulário físico.

## Limites e próximas entregas

O catch atual tenta compensar falha de gravação com delete; não cobre commit
posterior nem queda do processo. A próxima correção deve registrar intenção de
upload durável e recuperação coordenada. Não declarar atomicidade R2/PostgreSQL,
nem excluir órfãos históricos automaticamente.

A correção seguinte do formulário deve coordenar seleção/validação/envio,
preservar dados nas falhas e tornar todos os erros visíveis. Idempotência HTTP
fica para melhoria posterior: perda da resposta pode ocorrer após commit;
reenvio manual pode duplicar, mesmo com guarda contra cliques concorrentes.

Handoff R07/R09/R10: reutilizar a key canônica e associação da ocorrência;
definir autorização de leitura, sanitização de metadados antes da publicação
R07 e coordenação de exclusões com o futuro journal. Não abrir leitura pública
para justificar Location ou provar persistência.

Aceite completo de R05/R06 ainda requer evidência em MR/issue de SHA, pipeline,
deployment/URLs reais, upload PostgreSQL/R2, restart preservando foto e ocorrência,
e aparelho físico no formulário real (aparelho/SO/navegador/versão, abrir/cancelar
câmera preservando campos, tirar foto, prévia, enviar e confirmar). Registrar
fallback, 360 px e falha de upload. A prova anterior de R00 em `/prova-imagem`
deve ser preservada como tal; não substitui o formulário com upload.

# Consulta privada de relatos

## Contrato atual

`GET /api/occurrences` exige Bearer com sessão válida e retorna um array dos
relatos cujo autor é o usuário autenticado. Sem relatos, retorna `[]` com 200.
A ordem é `createdAt DESC, id DESC`; não há paginação nesta entrega.
Parâmetros como `userId` não alteram a autoria consultada.

`GET /api/occurrences/{id}` exige a mesma sessão e um UUID. Retorna 200 somente
para um relato do próprio usuário. Relato inexistente ou de outra conta retorna
404 com `OCCURRENCE_NOT_FOUND` no DTO comum de erro, sem revelar dados do autor.
UUID inválido retorna 400; ausência, expiração ou revogação de sessão retorna 401.

Respostas de sucesso usam `Cache-Control: no-store` para evitar cache HTTP de
dados privados. As duas respostas usam o DTO de registro: id, categoryId, categoryName, title,
description, neighborhood, reference, status e createdAt. O único estado atual
é `PENDING`, apresentado como Pendente. Não expõem referência do objeto, bucket,
URL de imagem ou identificador do autor. O storage técnico continua bloqueado.

## Frontend

`/meus-relatos` e `/meus-relatos/:id` são privadas e acessíveis por Minha conta.
A lista mostra categoria, local, data e estado e oferece navegação ao detalhe.
O detalhe mostra também descrição. Há carregamento, lista vazia, erro público
e nova tentativa manual sem recarregar a aplicação.

Query usa chaves `['private', userId, 'occurrences', ...]`, AbortSignal e schemas
Zod. Não há retry automático, polling ou refetch por foco/reconexão. Ao retornar
à página, os dados são considerados antigos e consultados novamente.
O AuthProvider cancela/remove consultas privadas ao encerrar ou trocar a sessão;
401 encerra sessão, enquanto 403 e falha de rede permitem nova tentativa.

## Limites e validação

Esta entrega cobre somente listagem e detalhe textual. Não implementa edição,
exclusão, visualização de fotografia ou novos estados. A conclusão da issue #23
requer definir e implementar os critérios restantes separadamente.

Backend: `OccurrenceQueryIntegrationTests` usa PostgreSQL descartável, cadeia de
segurança real, cadastro e login; verifica autoria, detalhe alheio/inexistente,
ordenação e ausência de campos internos. Execute `./mvnw verify` em backend/,
com Java 21 e Docker disponíveis.

Frontend: `MyReportsPage.test.tsx` usa AuthProvider, Router, Query e fetch
controlado para exercitar lista/detalhe, cancelamento, validação de resposta,
retry manual e 401. Execute lint, typecheck, test e build conforme o
[guia frontend](frontend-development.md).

Aceite publicado exige registrar SHA, pipeline e URLs na MR/issue, consultar com
duas contas sintéticas e conferir que uma não acessa relatos da outra, além de
navegação, teclado e viewport móvel. Testes locais não comprovam esse aceite.

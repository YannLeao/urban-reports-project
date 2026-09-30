# Consulta e gestão privada de relatos

## Contrato HTTP

Todas as rotas exigem Bearer com sessão válida. GET /api/occurrences retorna
somente relatos do autor autenticado, em createdAt DESC, id DESC, sem paginação.
GET /api/occurrences/{id} retorna apenas o próprio relato; alheio e inexistente
retornam o mesmo 404 OCCURRENCE_NOT_FOUND. Parâmetros de autoria são ignorados.
O DTO contém id, categoryId/categoryName, title, description (null se ausente),
neighborhood, reference, status, createdAt e version (inteiro não negativo).
Autor, chave de storage, bucket e URL do provedor não são expostos.

GET /api/occurrences/{id}/image usa a mesma autorização antes de ler storage.
Retorna JPEG/PNG/WebP validado, até 5 MiB, no-store e nosniff. Ausência do objeto
retorna 404 IMAGE_NOT_FOUND; provedor indisponível/conteúdo inválido retorna 502.
Leitura R2 é limitada a 5 MiB + 1 byte e fecha o stream. A fotografia não torna
bucket público nem remove EXIF; publicação e sanitização pertencem a R07.

PUT /api/occurrences/{id} usa multipart com todos os campos textuais obrigatórios
do [cadastro](occurrence-registration.md), description opcional e image opcional.
Imagem omitida mantém a atual; arquivo vazio é inválido. Repetições e arquivos
extras são recusados. Autor/status/createdAt são controlados pelo servidor.
200 retorna DTO atualizado após commit; cada edição incrementa version.
DELETE /api/occurrences/{id} exclui fisicamente e retorna 204 após commit.
GET de dados/foto e DELETE subsequentes retornam 404; não existe lixeira.

Ambas as escritas exigem If-Match com versão decimal entre aspas, por exemplo
`If-Match: "0"`. A ocorrência é bloqueada por id + autor na transação curta,
antes de revalidar PENDING e versão. 428 indica precondição ausente, 412 versão
inválida/antiga, 409 estado não alterável, 404 alheio/ausente e 401 sessão inválida.
O envelope comum de erro e no-store são preservados. CORS permite If-Match,
PUT e DELETE, sem cookies. CORS não substitui autorização.

## Imagens e concorrência

Na edição com substituição, intenção durável precede upload remoto. Nenhum lock
na ocorrência permanece aberto durante o upload. Ao vincular a nova intenção,
a transação bloqueia o relato, compara versão e agenda tombstone da foto antiga
junto à troca. Perda da corrida deixa upload novo recuperável. Exclusão e
agendamento também são atômicos no banco. Rollback não publica descarte.
O worker ignora LINKED, verifica referências sob lock do journal e remove apenas
objetos elegíveis. Chaves exclusivas não são reutilizadas, e link exige PENDING.
Detalhes no [ADR 0014](adr/0014-gerir-relatos-e-descarte-de-imagens.md).
Moderação futura deve usar o mesmo lock/versão; nenhum novo estado é criado.

## Frontend

Rotas privadas: /meus-relatos, /meus-relatos/:id e /meus-relatos/:id/editar.
Lista prioriza foto, título, local, categoria, data e Pendente. IntersectionObserver
inicia fotos apenas quando os cards entram na viewport. Corte 4:3 na lista;
detalhe mantém proporção reservada 4:3 com object-contain para imagem inteira.
Falha de foto é independente dos dados e não inventa evidência visual.
Cliente autenticado busca bytes; object URLs ficam apenas em memória e são
revogadas ao trocar versão, desmontar ou encerrar sessão. Token não vai à URL.

Queries usam ['private', userId, 'occurrences', ...], AbortSignal, sem retry,
polling ou refetch por foco/reconexão. Mutações diretas também não repetem envios.
Commit confirmado cancela consultas anteriores e renova lista/detalhe/foto.
Exclusão desmonta o detalhe antes de removê-lo do cache para evitar nova leitura.
Sessão encerrada remove consultas/rascunhos e impede resposta tardia na UI.
401 encerra sessão; 403/conflito/rede não. Resultado incerto orienta consultar
novamente, sem afirmar rollback. Edição preserva rascunho/foto em memória na falha.

Excluir usa dialog nativo modal, título do relato, explicação irreversível,
foco inicial em Cancelar, Escape e retorno ao acionador. Durante envio, bloqueia
cancelamento e ações concorrentes. Cancelar edição/exclusão não envia mutação.

## Verificação e limites

OccurrenceHttpTests usa PostgreSQL descartável, JWT/login/sessões e cadeia real,
com double apenas do provedor. Cobre descrição opcional/Unicode, isolamento,
foto, versões, edição/exclusão, corrida e rollback no commit, backoff e restart.
OccurrenceWritePolicyTests testa estado disallowed na fronteira de domínio:
null não é estado persistido. O banco só admite PENDING; prova integrada de outro
estado real fica para a evolução aprovada da moderação.
Testes frontend usam páginas reais, Query/AuthProvider e fetch controlado.

R07 ainda não fornece consulta pública: integrar remoção/invalidação nessa camada
quando existir, sem criar consulta pública fictícia. Ambiente publicado, aparelho
físico e aceite integral #23 requerem evidências próprias na MR/issue.

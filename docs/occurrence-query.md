# Consulta e gestão privada de relatos

O detalhe privado inclui o [histórico de moderação](occurrence-moderation.md),
com identificação funcional do responsável e justificativa de rejeição.
Os estados suportados são PENDING, IN_ANALYSIS, RESOLVED e REJECTED; somente
PENDING permite edição/exclusão. Rejeitados ficam fora das três superfícies
públicas (lista, detalhe e foto), mantendo acesso privado do autor.

## Contrato HTTP

Todas as rotas exigem Bearer com sessão válida. GET /api/occurrences retorna
somente relatos do autor autenticado, em createdAt DESC, id DESC, sem paginação.
GET /api/occurrences/{id} retorna apenas o próprio relato; alheio e inexistente
retornam o mesmo 404 OCCURRENCE_NOT_FOUND. Parâmetros de autoria são ignorados.
O DTO contém id, categoryId/categoryName, title, description (null se ausente),
neighborhood, reference, status, createdAt e version (inteiro não negativo).
O detalhe acrescenta history, conforme o [contrato de moderação](occurrence-moderation.md).
Autor, chave de storage, bucket e URL do provedor não são expostos.

GET /api/occurrences/{id}/image usa a mesma autorização antes de ler storage.
Retorna JPEG/PNG/WebP validado, até 5 MiB, no-store e nosniff. Ausência do objeto
retorna 404 IMAGE_NOT_FOUND; provedor indisponível/conteúdo inválido retorna 502.
Leitura R2 é limitada a 5 MiB + 1 byte e fecha o stream. A fotografia não torna
bucket público nem remove EXIF; leitura pública já serve originais, inclusive EXIF; sanitização segue pendente.

PUT /api/occurrences/{id} usa multipart com todos os campos textuais obrigatórios
do [cadastro](occurrence-registration.md), description opcional e coleção de mídias com manifesto opcional.
PUT legado image só substitui coleção singular; ausência de mídia preserva todas.
Consulte [manifesto e leitura individual](multiple-photos.md).
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
O comando de moderação usa o mesmo lock/versão, após revalidar ADMIN ativo
sob lock da conta; veja [moderação](occurrence-moderation.md).

## Frontend

Rotas privadas: /meus-relatos, /meus-relatos/:id e /meus-relatos/:id/editar.
Lista prioriza foto, título, local, categoria, data e estado. IntersectionObserver
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
OccurrenceWritePolicyTests testa recusa de escrita fora de PENDING.
OccurrenceHistoryIntegrationTests verifica imutabilidade, outbox, isolamento do
histórico, rejeitados fora das consultas públicas e upgrade V6→V7 com dados.
AdminProvisioningIntegrationTests complementa com fluxo legítimo, autorização,
concorrência, transições e rollback no commit do comando administrativo.
Testes frontend usam páginas reais, Query/AuthProvider e fetch controlado.

A consulta pública atual usa `/api/public/occurrences`, inclusive detalhe e foto,
e omite rejeitados. O comando administrativo invalida seus caches no frontend.
Ambiente publicado, aparelho físico e aceite integral #23 requerem evidências
próprias na MR/issue.

## Localização no cadastro e na edição

Latitude/longitude WGS84 foram adicionadas aos DTOs, nulas em relatos legados.
O formulário restaura e reenvia o par confirmado; PUT sem ambos preserva posição,
campos vazios não removem o ponto. Consulta em mapas e pinos canônicos estão na [entrega #44](occurrence-maps.md). Componente, provedor, confirmação/GPS e publicação: [guia de localização](occurrence-location.md).

## Mapa da consulta completa e dos detalhes

`?visao=mapa` alterna com Lista nas consultas pública e própria. Endpoints `/markers`
retornam projeções de todos os pontos elegíveis, sem depender da paginação de cards,
com contagens integrais de legado. Detalhes mostram ponto individual/ausência,
sem editar localização. Contrato, sobreposição, navegação, isolamento de cache e
roteiro: [mapas nas consultas](occurrence-maps.md).

Detalhes próprio/público/admin exibem galeria; cards e mapas baixam só capa. V13 retira image_key; recuperação reconhece todas as mídias. [Contrato e deploy](multiple-photos.md).

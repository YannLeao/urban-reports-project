# ADR 0024: Coleção ordenada de mídias e recuperação de todas as referências

- Status: aceito
- Data: 2026-10-19
- Referência: #52; evolução posterior #45

## Contexto

Uma coluna de fotografia impede coleção, identidade individual e descarte seguro
quando há mais de um objeto. O recuperador também dependia dessa coluna.

## Decisão

V13 move a referência para `occurrence_media`: UUID opaco, FK com cascade,
object key única, tipo IMAGE, MIME/tamanho anuláveis e posição de 0 a 4.
A posição zero é a capa; não há segundo campo para representá-la. A unicidade
por ocorrência/posição é DEFERRABLE INITIALLY DEFERRED para permitir permutações
completas. Serviço valida cardinalidade final 1–5 e posições contíguas sob lock
do relato; a constraint limita a cinco posições, mas não garante mínimo sozinha.

Legado recebe UUID novo e mesma key, sem consultar o provedor; tamanho permanece
NULL e MIME só é inferido das extensões controladas. Keys ambíguas preservam
MIME desconhecido. A validação de leitura existente continua recusando associações
fora do padrão seguro; não ampliar leitura de keys arbitrárias por causa do backfill.
A coluna antiga é retirada: uma única fonte de verdade, sem escrita dupla.

Edição usa manifesto da coleção final (id existente OU índice de upload). Ausência
de manifesto e arquivos preserva todas as fotos. POST singular é compatível;
PUT singular só pode substituir uma coleção de uma foto. `/image` resolve capa.
DTOs trazem metadados/rotas, nunca keys ou nomes originais. Relação lazy com batch
50 evita collection fetch join na paginação e mantém contagens corretas.

Todos os arquivos são validados sequencialmente antes de intenções/uploads;
só handles multipart e metadados permanecem retidos. Multipart usa spool em disco.
Intenções são confirmadas individualmente antes de qualquer PUT. Escrita HTTP
revalida conta/sessão/papel sob lock; depois bloqueia novas intenções por key em
ordem textual, faz uploads sequenciais e bloqueia/revalida o relato. Ordem global:
conta → novos journals ordenados → relato → retirada das keys antigas ordenadas.
Keys novas nunca são compartilhadas/reutilizadas. Retirada só ocorre sob lock do
relato; recuperador não bloqueia relatos, usa SKIP LOCKED e consulta não bloqueante
de **qualquer** `occurrence_media.object_key`. Assim não há ciclo com moderação.
Removidas recebem TOMBSTONE na transação dos vínculos. Exclusão agenda todas.

Preservamos adaptador `ImageStorage`, bytes originais e estados/backoff/tombstones
dos ADRs 0013/0014. Falha de PUT/commit não executa delete em catch. Worker desligado
mantém intenções; descarte espera retomada. Não há transação distribuída.

## Consequências

Deploy exige parar todas as instâncias/workers antigos antes de V13. Não há zero
downtime nem rollback binário para versão que usa `image_key`; restauração de
schema/dados demanda plano próprio. Ver [operação](../multiple-photos.md).

Até cinco PUTs mantêm conexão/transação/locks durante I/O: cada chamada conserva
60 s totais/25 s por tentativa/duas tentativas. Cinco chamadas podem consumir até
300 s de orçamento de cliente, além de validação/banco; isso não é SLA nem prova
de cancelamento remoto. Dimensionar pool, heap, disco temporário e timeouts do
proxy antes da publicação. Não aumentamos retries, concorrência ou limites de vídeo.

EXIF continua nos bytes servidos inclusive publicamente; bucket privado e decoder
não anonimizam. Sanitização exige decisão separada do mantenedor. Não há geração
de thumbnails: cards baixam só a capa original; detalhe baixa só a selecionada.

A relação e a autorização por mídia são pontos de extensão para #45; vídeo não é
aceito no schema/validação/UI. Antes dessa tarefa, decidir streaming/Range,
codecs/containers/duração, tamanho, buffers, processamento e transporte autenticado.

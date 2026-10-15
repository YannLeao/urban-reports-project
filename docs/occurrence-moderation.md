# Moderação e histórico de ocorrências

## Estado da integração

O fluxo administrativo usa a identidade compartilhada de
[provisionamento](admin-provisioning.md). ADMIN ativo acessa fila, detalhe,
foto e transições; SUPER_ADMIN não herda essa permissão. Cadastro público
permanece USER. Cada transição válida também cria, na mesma transação, uma
notificação interna para o autor; a central do cidadão permite consultar e
marcar como lidas somente as próprias notificações.

## Estados e justificativa

PENDING (Pendente), IN_ANALYSIS (Em análise), RESOLVED (Resolvida) e REJECTED
(Rejeitada). Somente PENDING → IN_ANALYSIS, PENDING → REJECTED,
IN_ANALYSIS → RESOLVED e IN_ANALYSIS → REJECTED são válidas. Estados finais
não têm saída. `OccurrenceTransition` e `transitionSchema` centralizam regras
usadas pelo comando administrativo e formulário de rejeição.

Rejeição exige 10–500 pontos de código Unicode após trim externo somente de
U+0009–U+000D e U+0020, igual ao contrato textual existente. NUL e UTF-16
inválido são recusados. Sem truncamento ou normalização NFC. Espaços não ASCII
são conteúdo. PostgreSQL exige o mesmo trim e conta com char_length.
Outros destinos aceitam ausência/null e recusam qualquer string de justificativa,
inclusive vazia. Renderizar texto sem interpretar HTML.

## Persistência e leitura

V7 introduziu estados/histórico; V8 acrescenta identidade administrativa.
Conferir numeração de futuras migrations antes de integrar trabalho concorrente.
Migrations aplicadas permanecem intactas e Hibernate em validate. V7 amplia o
CHECK de estados, preserva os dados e não fabrica histórico retroativo.

`occurrence_history` guarda UUID do evento/ocorrência/responsável, origem,
destino, instante UTC/timestamptz, justificativa e versão resultante. O par
ocorrência/versão é único. FKs sem cascata preservam relato e responsável.
Trigger rejeita UPDATE, DELETE e TRUNCATE, inclusive fora do Hibernate;
entidade `@Immutable` e repositório somente de leitura reforçam a proteção.
Um operador privilegiado que possa remover/desabilitar triggers ou alterar
schema pode contorná-la; não é garantia contra administração do banco.

GET `/api/occurrences/{id}` inclui `history`, ordenado por occurred_at e versão
como desempate estável. Verifica autoria antes de consultar eventos; alheio ou
inexistente retorna 404. Itens: id, previousStatus, newStatus, occurredAt, reason
e responsible: "Moderação". UUID/e-mail do moderador não integram esse DTO;
a identidade exata permanece persistida. Lista privada e DTO público não
incluem histórico. `/meus-relatos/{id}` exibe cronologia e justificativa;
edição/exclusão continuam disponíveis somente em PENDING.

## Visibilidade pública

REJECTED fica fora da lista pública e retorna 404 no detalhe e na foto públicos.
A elegibilidade é verificada antes de chamar ImageStorage. Autor mantém acesso
privado. PENDING, IN_ANALYSIS e RESOLVED seguem públicos. O futuro mapa deve
reutilizar esse filtro. O DTO público nunca inclui histórico interno.

## API administrativa e concorrência

Todas as rotas exigem sessão revogável e ADMIN atualmente ACTIVE. O serviço
revalida autorização mesmo quando chamado fora do controller. USER, SUPER_ADMIN,
ADMIN pendente/desativado e anônimo não moderam.

- GET `/api/admin/occurrences?page=0&size=20`: items/page/size/totalItems/totalPages,
  somente PENDING/IN_ANALYSIS, createdAt ASC/id ASC, size 1–50.
- GET `/api/admin/occurrences/{id}`: `{report,history}`, inclusive finalizados.
  report segue DTO privado com versão, sem histórico duplicado; history inclui
  estados, horário, justificativa e nome legível do responsável, sem e-mail.
- GET `/api/admin/occurrences/{id}/image`: bytes privados, no-store/nosniff,
  usando ImageStorage existente, sem URLs com token.
- POST `/api/admin/occurrences/{id}/transitions`: JSON `{target,reason}`,
  If-Match decimal entre aspas obrigatório. Sucesso: mesmo detalhe atualizado
  e ETag da versão resultante, somente após commit.

JSON limitado a 8192 bytes; extras/tipos coercíveis são recusados. Ausência/null
de reason é válida fora de rejeição; qualquer string é recusada. Erros seguem
ApiErrorResponse: 400 validação, 428 sem If-Match, 412 versão divergente,
409 transição incompatível, 404 ocorrência ausente, 401/403 conforme sessão/papel.
A versão é verificada antes de estado para um comando de moderação válido.

O serviço trava a conta do ADMIN, revalida sessão/papel/status e só então trava
a ocorrência. A autorização confirmada sob lock da conta é o ponto de
serialização com desativação: se esta confirmou antes, recusa; se aguarda o
lock, a ação autorizada pode confirmar primeiro. Não promete cancelamento
retroativo. A mesma linha de ocorrência é disputada por edição/exclusão do autor.
Moderação não trava journal nem faz I/O de storage, preservando ADR 0014.

Estado, incremento de versão, evento com responsável autenticado/horário do
Clock e notificação com `event_id` único confirmam na mesma transação. Falha no
commit reverte tudo. Repetição/conflito não acrescenta evento. Edição antiga em PENDING
não confirma após análise; exclusão não remove relato analisado/finalizado.
Upload que perdeu uma disputa continua recuperável pelo journal existente.

## Notificações do cidadão

- GET `/api/notifications?page=0&size=20`: retorna somente itens cujo
  `recipient_id` é a conta autenticada, ordenados do mais recente ao mais antigo.
- POST `/api/notifications/{id}/read`: marca o item próprio como lido; repetir a
  operação é idempotente e um item de outra conta retorna 404.
- Transições para `REJECTED` incluem a justificativa administrativa na mensagem.
  O trigger de banco usa o evento de histórico como chave única, garantindo uma
  notificação por transição válida mesmo quando o histórico é inserido fora do
  Hibernate.

## Interface

`/administracao/relatos` tem fila paginada, fotografia, conteúdo prioritário,
carregamento, erro com retry e vazio. `/administracao/relatos/{id}` mostra foto
inteira, dados, histórico cronológico e somente ações válidas. Rejeição abre
campo com contador em pontos de código, erro acessível e foco. Guarda síncrona
impede envio repetido. Conflitos mostram aviso e recarregam o relato, sem sucesso
falso. Finalizados permanecem legíveis, sem ações.

Queries usam `['private', userId, 'moderation', ...]`, AbortSignal e limpeza no
encerramento da sessão. Sucesso invalida fila/detalhes afetados e consultas
públicas; detalhe público antigo do relato é removido para não conservar um
rejeitado em cache. Guard/navegação por papel complementam a proteção do servidor.
Também invalida o [relatório administrativo](occurrence-report.md) do mesmo ADMIN.

## Notificações

Trigger AFTER INSERT de histórico grava na mesma transação
`occurrence_notification_outbox(event_id, recipient_id, created_at)`.
event_id é PK/FK do evento; recipient_id vem do autor da ocorrência; created_at
replica o instante do evento. Rollback remove evento e intenção. Evento/versão
duplicado não cria outra intenção.

Esta é uma intenção de entrega, não a notificação visível. A central deve ler
o evento por JOIN com histórico, inserir notificação com UNIQUE(event_id) e
confirmar progresso na mesma transação, ou usar inbox deduplicada no consumidor
externo. Não apagar histórico para reconhecer consumo. Estratégia de consumo,
worker e prova de exatamente uma notificação ainda dependem dessa entrega.
Não há callback em memória nem stub declarado como integração concluída.

## Compatibilidade e demonstração

Publicar frontend que reconhece os quatro estados e três papéis antes de emitir
novos valores. Depois publicar backend com migrations V7/V8 e provisionar pelo
bootstrap explícito autorizado. Bundle antigo USER/PENDING não pode receber os
novos valores. Esta ordem não implica autorização de deploy.

O [roteiro de provisionamento](admin-provisioning.md#roteiro-de-revisão) cobre
criar/ativar/moderar/desativar com contas legítimas, consulta como autor e matriz
de negativas. Notificações internas permanecem pendentes da central; não fechar
a issue #24 como aceite integrado completo por existir apenas a intenção durável.

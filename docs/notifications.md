# Notificações internas

Cada transição válida de moderação cria exatamente uma notificação para o autor
na mesma transação do estado e histórico. `event_id` único identifica a transição;
conflitos, repetições e rollback não criam notificações adicionais. Rejeições
incluem a explicação integral do ADMIN, renderizada como texto. Não há e-mail,
push ou entrega em tempo real. A #50 disponibiliza o
[transporte compartilhado Brevo](transactional-email.md), mas notificações externas
da #42 ainda exigem implementação própria. Não reutilizar esta outbox como fila
genérica de e-mail.

## Contrato HTTP

Exige Bearer com sessão revogável, conta ACTIVE e papel USER exato. Respostas
são privadas com Cache-Control no-store; os DTOs omitem moderador e destinatário.

- GET `/api/notifications?page=0&size=20`: items/page/size/totalItems/totalPages/
  unreadCount. Filtra destinatário pela identidade autenticada; ordena createdAt
  DESC/id DESC. page >= 0, size de 1 a 100; inválidos retornam 400 INVALID_REQUEST.
  unreadCount conta todas as páginas do usuário. Não recebe destinatário do cliente.
- Item: id, occurrenceId, type (STATUS_CHANGED ou OCCURRENCE_REJECTED), message,
  createdAt e readAt (null até a leitura), instantes ISO-8601 UTC.
- POST `/api/notifications/{id}/read`: 200 com item atualizado. Repetição preserva
  readAt; id alheio/inexistente retorna 404 NOTIFICATION_NOT_FOUND, UUID inválido
  retorna 400. Revalida conta/papel/status/sessão sob lock antes de travar o item.
- Anônimo/sessão inválida: 401; papel incompatível: 403. Falha de persistência:
  503 NOTIFICATIONS_UNAVAILABLE. Erros usam ApiErrorResponse, sem dados internos.

## Persistência e operação

V10 cria tabela e trigger AFTER INSERT no histórico. V11 materializa intenções
antigas pelo outbox, deduplicadas por event_id, indexa não lidas e compartilha
o template em português entre recuperação e novas transições. Mensagens já
criadas pela V10 são preservadas. Mantém o
outbox e histórico intactos, sem worker ou limpeza automática. Em instalações
existentes, avisos históricos recuperados começam não lidos, com o horário do
evento. Não fabrica eventos para relatos sem histórico. Ver [ADR 0021](adr/0021-materializar-notificacoes-internas.md).

## Interface e validação

`/notificacoes` e sino são exclusivos de USER. A lista pagina de 20 em 20, exibe
estado de leitura, horário e link para o relato. Marcar leitura atualiza o contador
global e as páginas em cache. Consulta falha oferece retry; leitura falha permite
repetir. A atualização é manual ou ao entrar na central, sem polling. O sino
não promete aviso imediato enquanto a pessoa permanece em outra página.
401 encerra a sessão; 403/rede preservam credencial e permitem recuperação.

`NotificationIntegrationTests` valida HTTP com cadeia real, autoria, paginação,
contagem, leitura idempotente, erros, revogação e upgrade de V9/V10. Os testes de
provisionamento/moderação verificam as quatro transições, concorrência e rollback
incluindo a notificação visível. `NotificationsPage.test.tsx` cobre contrato real
Query/fetch/schema, sino, paginação, leitura, falhas e 401/403, sem API remota.

No ambiente publicado, validar com contas sintéticas: ADMIN altera um relato,
autor atualiza a central e lê o aviso; outro cidadão não o lista nem o marca.
Rejeitar outro relato com explicação e conferir conteúdo, teclado e layout móvel.
Registrar SHA, pipeline e evidências na MR; testes locais não comprovam deploy.

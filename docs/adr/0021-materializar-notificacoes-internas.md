# ADR 0021: Materializar notificações internas na transação do histórico

- Status: aceito
- Data: 2026-10-15

## Contexto

O ADR 0015 preservou uma intenção durável por transição. A central do cidadão
precisa de mensagem persistida, leitura independente e exatamente uma notificação
por evento, incluindo os eventos anteriores à integração.

## Decisão

Materializar a notificação em trigger AFTER INSERT do histórico na mesma
transação, com UNIQUE(event_id), destinatário obtido do autor e justificativa de
rejeição incluída na mensagem. V10 introduz o trigger; V11 recupera intenções
antigas com ON CONFLICT DO NOTHING. Manter migrations anteriores intactas.
Preservar outbox/histórico, sem worker, entrega externa ou limpeza nesta etapa.

A central exige USER ativo. Leitura de item revalida conta e sessão sob lock
antes do lock da notificação. Consultas e mutações filtram por destinatário;
contagem de não lidas abrange todas as páginas. O frontend usa cache privado,
sino com contagem e atualização manual, sem polling.

## Consequências

Falha na criação de notificação reverte também a transição. Não há janela entre
commit do histórico e disponibilidade na central, nem consumidor a operar.
Templates de mensagem pertencem ao banco e sua evolução exige nova migration.
Avisos históricos recuperados iniciam não lidos. Outbox e notificações acumulam
até uma futura política de retenção. O contrato não inclui e-mail ou push.

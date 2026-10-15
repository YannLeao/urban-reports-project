# ADR 0015: Preparar histórico de moderação e intenção de notificação

- Status: aceito para a base de persistência e leitura; comando administrativo pendente
- Data: 2026-10-15

## Contexto

A issue #24 exige estados finais, auditoria imutável e uma notificação por
transição. A identidade atual só suporta USER e não tem atividade nem
provisionamento administrativo. A central de notificações também é uma
dependência separada. Não criar atalhos de promoção ou identidade paralela.

## Decisão

Preparar os estados IN_ANALYSIS, RESOLVED e REJECTED preservando PENDING e a
versão do ADR 0014. Criar histórico sem eventos retroativos, com identidade
estável por FK, versão resultante única por ocorrência e instante UTC.
Triggers bloqueiam UPDATE/DELETE/TRUNCATE. Não usar cascatas para apagar
histórico. O DTO do autor apresenta responsável funcional “Moderação”.

Um trigger de inserção persiste intenção de notificação na mesma transação,
com event_id como PK/FK e autor obtido da ocorrência. A futura central deve
deduplicar por esse evento. A intenção não significa entrega da notificação.

Rejeitados deixam de integrar lista, detalhe e foto públicos, com 404 no
acesso direto. Permanecem no acesso privado do autor. Futuro mapa deve seguir
a mesma elegibilidade.

## Consequências

O operador privilegiado do banco pode contornar triggers; proteção cobre o
caminho normal da aplicação. FKs impedem remoção física de relatos e contas
referenciados. Desativação futura deve preservar a conta e a auditoria.

Comando, fila, telas administrativas, autorização sob lock, disputas de escrita
e consumo da intenção dependem de integrações ainda ausentes. Não abrir rotas
administrativas com autorização incompleta. A ordem de publicação precisa
preparar o frontend para novos estados e papéis antes de emiti-los.
Contrato e limites: [moderação](../occurrence-moderation.md).

# ADR 0033: Adotar fluxo explícito de status de ocorrências

- Status: aceito
- Data: 2026-11-05

## Contexto

O fluxo anterior usava `IN_ANALYSIS` e permitia rejeitar depois da análise. O
fluxo definido para o produto exige `PENDING → ACCEPTED → RESOLVED` ou
`PENDING → REJECTED`, com comentário obrigatório ao aceitar ou rejeitar.

## Decisão

O backend usa `PENDING`, `ACCEPTED`, `RESOLVED` e `REJECTED`. A aceitação e a
rejeição exigem comentário textual de 10 a 500 pontos de código após o mesmo
trim e validação já usados pela moderação. A resolução não exige comentário.
O histórico antigo com `IN_ANALYSIS` permanece legível e é apresentado como
`Aceita`; novos eventos usam `ACCEPTED`. A fila administrativa inclui PENDING e
ACCEPTED, pois ambos exigem ação do administrador.

A branch atual usa a migration V16 porque V15 já é
`V15__password_recovery_tokens.sql` na base vigente. A migration converte
ocorrências existentes para `ACCEPTED` sem reescrever o histórico append-only.

## Consequências

Notificações internas passam a usar rótulos em português e incluem o comentário
nas transições de aceitação e rejeição. `ACCEPTED → REJECTED` deixa de ser
permitido; relatos aceitos aguardam apenas a resolução.

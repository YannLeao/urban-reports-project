# ADR 0031: Limitar a recuperação de senha em memória

- Status: aceito
- Data: 2026-11-05

## Contexto

A recuperação precisa enviar um segredo transitório sem expor existência de conta,
sem bloquear HTTP no provedor e sem concorrer no pool comum. Apenas o hash do token
é persistido. A fila de notificações de relatos não permite reconstruir esse segredo.

## Decisão

Usar executor Spring dedicado, dois workers e fila de oito, com admissão atômica
antes de emitir/inutilizar tokens. Submeter após commit confirmado, revalidar
vigência em transação curta e enviar sem locks/transaction aberta. Encerramento
recusa admissões novas, drena por até 30 s e cancela/interrompe o restante.
Reutilizar transporte Brevo e observabilidade; não repetir automaticamente,
inclusive em timeout, que pode representar aceite incerto.

Limites locais concorrentes: e-mail canônico 60 s/cinco admissões por hora,
pedido e reset por origem 30/10 min em mapas separados com teto e expiração.
Proxies só são confiáveis por configuração explícita. Resposta de pedido suprimido
é idêntica e não altera tokens. Origem dedicada configurável preserva fallback
administrativo somente quando ausente.

## Consequências

Não há garantia durável ou exatamente uma vez. Reinício abrupto perde fila e
contadores; múltiplas instâncias não compartilham limitação. A fila reduz a vida
útil do link; mensagens podem chegar fora de ordem. Só o token mais recente vale;
nenhum lock cobre banco e provedor. O prazo de drenagem não promete concluir todo
um lote cheio. Não persistir token bruto nem adicionar criptografia própria,
outbox, broker ou Redis para contornar essa decisão. Durabilidade futura exige
outro ADR. Os números são decisões deste projeto, não valores prescritos por OWASP.

Contrato e operação: [recuperação](../password-recovery-integration.md).

Referência de implementação: [ThreadPoolTaskExecutor, Spring Framework 7.0](https://docs.spring.io/spring-framework/docs/7.0.x/javadoc-api/org/springframework/scheduling/concurrent/ThreadPoolTaskExecutor.html).
Capacidade, rejeição e shutdown são configurados explicitamente; não se usam os defaults ilimitados do executor.

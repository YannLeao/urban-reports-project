# ADR 0013: Recuperar uploads com journal durável

- Status: aceito
- Data: 2026-09-30

## Contexto

PUT no R2 e commit PostgreSQL não são atômicos. saveAndFlush não confirma commit;
compensação em catch/callback não sobrevive à queda do processo.

## Decisão

Validar antes de efeitos externos; gerar key no orquestrador e confirmar intenção
PENDING em transação REQUIRES_NEW. Uma segunda transação bloqueia a linha durante
PUT e criação; ocorrência e LINKED são confirmados juntos. O retorno só ocorre
após commit. Resultado incerto nunca dispara exclusão imediata.

Recuperar lotes com FOR UPDATE SKIP LOCKED, atraso padrão de cinco minutos,
checagem de referência e delete idempotente. Ao assumir a key, sucesso ou falha
de DELETE deixam TOMBSTONE para impedir escritores atrasados. Erros persistem como DELETE_FAILED,
com backoff de 60 segundos dobrando até uma hora. Sucesso deixa TOMBSTONE,
revisitado a cada hora indefinidamente para capturar PUT tardio. Um escritor só
pode usar PENDING; tombstone impede confirmação após o recuperador assumir.

Cliente R2 tem duas tentativas, até 25 segundos por tentativa e 60 segundos por
chamada. Atraso mínimo permitido é dois minutos. Timeouts do cliente não provam
cancelamento no provedor: tombstones e reconciliação continuam necessários.

## Consequências

Mantemos conexão/transação/lock durante I/O externo, inclusive na recuperação.
Lotes são limitados a 20 (máximo 100); indisponibilidade prolongada pode aumentar
a fila e ocupar conexões. Dimensionar pool e observar fila antes de elevar lote.
Tombstones têm custo permanente de banco e DELETE; não removê-los sem política
explícita que trate conclusões tardias do provedor.

Recuperação é eventual e depende de banco, storage e scheduler disponíveis.
Não há atomicidade absoluta entre sistemas nem deduplicação de reenvio HTTP.
O journal cobre novos uploads, sem limpeza retroativa de objetos históricos.
Exclusões futuras de ocorrências devem coordenar o mesmo lock/estado e definir
retenção/privacidade. Nenhuma rota pública de leitura é introduzida.

Referências: [TransactionTemplate](https://docs.spring.io/spring-framework/reference/data-access/transaction/programmatic.html)
e [timeouts SDK v2](https://docs.aws.amazon.com/sdk-for-java/latest/developer-guide/timeouts.html).

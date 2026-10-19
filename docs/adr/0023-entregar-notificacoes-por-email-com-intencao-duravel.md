# ADR 0023: Entregar notificações por e-mail com intenção durável

- Status: aceito
- Data: 2026-10-19
- Complementa: ADRs 0021 e 0022, sem alterar contratos de convites

## Contexto

A #42 exige os mesmos eventos/destinatários das notificações internas. O envio
apenas após commit perde a tentativa se o processo cair. A outbox V7 registra
intenção de domínio e não deve virar fila genérica de e-mail. O backend Render
pode reiniciar/suspender; não se contrata broker ou worker adicional.

## Decisão

V12 captura cada inserção nova na central por trigger transacional com vínculo
único. Sem backfill nem corte por timestamp. Captura sempre ativa, consumidor
desligado por padrão. Tabela específica guarda estado, datas, reserva/posse,
versão, contagem operacional, send_id opaco e diagnóstico controlado, sem conteúdo
ou endereço. Histórico, central, outbox e mensagens legadas permanecem intactos.

Consumidor sequencial no Spring Boot, lote 3 e fixedDelay 60 s por padrão, com
scheduler próprio de uma thread e qualificador explícito também para uploads.
Reserva individual com SKIP LOCKED; rede fora de transação/locks/conexão de banco;
conclusão condicional à posse/prazo. Lease padrão 60 s, ao menos deadline +30 s.

Reutilizar TransactionalEmailSender e observabilidade da #58, uma chamada por
tentativa e sem retry automático, inclusive 429/5xx. Falhas conhecidas param em
FAILED; ambiguidades/reservas expiradas em UNCERTAIN. Falha ao persistir resultado
interrompe novas reservas sem repetir POST. CLI privada, sem contexto Spring,
HTTP/Flyway/scheduler, consulta e reconcilia por ID/estado/versão com auditoria.
Reemissão incerta exige processo anterior encerrado, janela de rede esgotada e
reconhecimento explícito de duplicidade; aceite comprovado pode ser confirmado.
ACCEPTED/PROCESSING/SUPPRESSED não são reabertos pela ferramenta.

E-mail genérico com link privado sem credencial, sem copiar título/justificativa.
Resolver endereço atual pelo destinatário interno e exigir USER/ACTIVE, sem
exigir sessão; inconsistência vira SUPPRESSED. Não manter lock de conta na rede
nem prometer atomicidade com alterações concorrentes de elegibilidade.

## Consequências

Falha de captura reverte a transação inteira; falha Brevo posterior não desfaz
moderação/aviso/leitura. Intenções sobrevivem a reinícios, mas não se promete
exactly-once, recebimento, ordem, prazo em suspensão ou recuperação automática de
falhas. Pendências não expiram por idade e não há limpeza automática. Operador
precisa reconciliar falhas, com credenciais privadas e sem expor dados em logs.
Configuração global inválida pausa reservas e gera um diagnóstico por condição;
erros operacionais repetem no máximo a cada cinco minutos por condição/processo.
Operação e homologação: [guia de notificações externas](../notification-email.md).

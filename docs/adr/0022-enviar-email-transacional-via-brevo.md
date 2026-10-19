# ADR 0022: Enviar e-mail transacional via Brevo HTTPS

- Status: aceito
- Data: 2026-10-19
- Substitui: somente a decisão de transporte SMTP do ADR 0016

## Contexto

Convites administrativos precisam de transporte HTTPS para o backend no Render.
Não há domínio próprio, nem controle de DNS de onrender.com/vercel.app. Cadastro,
liberação transacional e remetente da conta Brevo dependem do mantenedor.

## Decisão

Preservar ActivationMailSender e o prazo de 24 horas. A composição portuguesa
no adaptador administrativo delega para TransactionalEmailSender, com
EmailMessage, EmailSendResult e EmailSendException sanitizados em email/.
BrevoEmailSender usa HttpClient do JDK 21 e Jackson existente, sem SDK ou novas
dependências. POST ao endpoint fixo HTTPS api.brevo.com/v3/smtp/email, TLS padrão,
api-key, sender/to/subject/textContent; somente 201 com messageId textual não
vazio significa aceite. Redirects são recusados. Endpoint alternativo fica
restrito ao construtor de teste com acesso de pacote.

Não fazer retry automático nem declarar idempotência/exatamente uma vez.
Uma chamada produz um único POST; testes incluem 429, 5xx, redirects, perda de
resposta e timeout. Não habilitar a propriedade JDK de retry para todos os métodos.
Conexão: 3000 ms; deadline de requisição incluindo corpo: 10000 ms, com cancelamento.
Configuração ausente falha antes da rede, sem impedir boot. Remover SMTP e starter-mail.

## Consequências

Conta e token confirmam antes do envio síncrono, fora de transação/locks. Não há
outbox, worker, garantia durável após reinício ou atomicidade banco/provedor.
Timeout/resposta inválida pode significar aceite incerto; FAILED não desfaz o
convite. Reenvio gera outro token e invalida o anterior mesmo se falhar.
Não registrar destinatário, payload, resposta, token, chave ou causa bruta.
DTOs têm toString redigido. Não habilitar logs de wire/headers/body do cliente.
Aceite não comprova recebimento. Tracking e remetente devem ser homologados na
conta; anonimização não desliga tracking. Recuperação #20 e notificações externas
#42 permanecem próprias implementações futuras. O ADR 0016 conserva seu histórico.
Operação e roteiro: [e-mail transacional](../transactional-email.md).

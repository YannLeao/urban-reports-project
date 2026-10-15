# ADR 0016: Provisionar identidade administrativa e integrar moderação

- Status: aceito
- Data: 2026-10-15
- Evolui: ADRs 0011, 0014 e 0015

## Contexto

A #26 fornece a fundação que faltava ao comando de moderação da #24: contas
ADMIN provisionadas legitimamente, atividade atual, ativação e desativação com
revogação. Não há abstração de e-mail ou recuperação já implementada para reusar.
A gestão completa de SUPER_ADMIN e notificações de ocorrências ficam fora.

## Decisão

Ampliar a mesma UserAccount com papéis USER/ADMIN/SUPER_ADMIN e status
PENDING_ACTIVATION/ACTIVE/DISABLED. V8 preserva cidadãos ACTIVE, permite ausência
de hash somente em conta inelegível e proíbe status administrativos em USER e
SUPER_ADMIN. Cadastro público recusa campos privilegiados. Criação de relatos
continua exclusiva de USER; SUPER_ADMIN não herda moderação.

Criar primeiro SUPER_ADMIN por comando explícito com console protegido, modo
sem servidor HTTP e entradas do operador. Lock de linha de guarda e índice único
parcial limitam a uma conta, sem promoção de identidade existente ou reset.

Convite específico tem 256 bits aleatórios, hash SHA-256 e validade de 24 horas.
Ativação consome token/define hash Argon2id/ativa atomicamente, sem sessão
automática. Reenvio invalida anteriores sob lock da conta. SMTP acontece após
commit, com resultado honesto ACCEPTED/FAILED e recuperação por reenvio. Não
introduzir outbox genérica nem substituir produção por logs. Link usa origem
configurada validada e fragmento removido da URL pela página pública.

Revalidar atividade a cada autenticação. Mutações privilegiadas conferem sessão,
papel exato e atividade sob lock de conta. Múltiplas contas seguem UUID textual
ascendente; tokens e sessões vêm depois. Moderação bloqueia conta antes de
ocorrência, revalida If-Match/estado e confirma estado/versão/evento/outbox da
V7 juntos. Desativação aguarda operações autorizadas sob esse lock e, depois
confirmada, impede novas ações. Preservar ordem journal → ocorrência do ADR 0014.

## Consequências

Sem atomicidade SMTP/banco ou garantia de entrega ao destinatário. Falha/perda
de resposta mantém conta pendente recuperável; mensagens podem chegar fora de
ordem, mas somente o convite mais recente é válido. A desativação não remove
conta/histórico. Trocar senha nunca reativa uma conta. A central de notificações
continua pendente e separada do envio de convites. Publicação deve preparar o
frontend para novos papéis antes de emiti-los. Nenhuma decisão autoriza deploy.
Contrato e operação: [provisionamento](../admin-provisioning.md).

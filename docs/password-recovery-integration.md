# Recuperação de senha por e-mail

O pedido público em `POST /api/auth/password-recovery-requests` aceita JSON com
`email`. Formato válido recebe `202 {"requested":true}` e `Cache-Control: no-store`,
com o mesmo contrato para conta ativa, inexistente, pendente, desativada ou pedido
suprimido. Não confirma emissão nem envio. Formato inválido recebe 400
`INVALID_EMAIL`. JSON limitado a 8 KiB, tipos incorretos e campos extras são
recusados. Erros usam o envelope compartilhado; indisponibilidade de banco pode
retornar 503 `RECOVERY_UNAVAILABLE`.

`POST /api/auth/password-resets` recebe `token` e `password`; sucesso é
`200 {"reset":true}`, sem autenticação automática. Inválido, expirado ou consumido:
400 `INVALID_RECOVERY_LINK`; senha inválida: 400 `INVALID_PASSWORD`. Limite por
origem excedido: 429 `RECOVERY_RATE_LIMITED`, envelope comum e `no-store`.

## Conta, token e transação

Reutiliza `UserAccount`, `RegistrationValidation.canonicalEmail`, `PasswordPolicy`
e o encoder Argon2id central. USER, ADMIN e SUPER_ADMIN ativos são elegíveis;
recuperação nunca ativa ou reativa uma conta. V15 cria a tabela própria
`password_recovery_tokens`; nenhuma migration anterior foi editada.

O token tem 32 bytes de `SecureRandom`, Base64 URL sem padding. Somente SHA-256
hexadecimal é persistido; o bruto não é retornado pela API nem armazenado na fila
em banco. Validade fixa de 30 minutos desde a emissão, inválido exatamente no
limite. Nova emissão admitida invalida os anteriores atomicamente. Pedido
suprimido por intervalo, quota, capacidade, shutdown ou configuração não emite
nem invalida. Falha de envio depois do commit conserva o novo token e não restaura
os anteriores. Retenção de tokens históricos permanece fora deste escopo.

Solicitação e reset adquirem primeiro o lock da conta, depois alteram o token e,
no reset, as sessões. A descoberta inicial do ID não substitui a leitura sob lock.
Troca do hash, consumo condicional e `SessionRevocation.revokeAllSessions` confirmam
na mesma transação; falha inclusive no commit reverte tudo. Revogação tem propagação
MANDATORY. Login calcula `matches` fora do lock e compara o hash novamente sob
lock antes de emitir sessão: login antigo confirmado antes do reset é revogado;
se tentar confirmar depois, falha. Tokens administrativos não são intercambiáveis.

## Envio limitado em memória

`PasswordRecoveryService → RecoveryDelivery → TransactionalPasswordRecoveryMailSender
→ TransactionalEmailSender → BrevoEmailSender`. O executor Spring nomeado
`passwordRecoveryExecutor` tem dois workers fixos e fila de oito tarefas por
padrão, com rejeição explícita. Sem pool comum, CallerRuns ou espera por vaga.

Uma reserva atômica local cobre preparação/transação, fila e execução. Ela é
adquirida antes de consultar elegibilidade e antes de alterar tokens; é liberada
uma única vez em conta ausente/inelegível, rollback, falha de commit, submissão
rejeitada, cancelamento ou término da tarefa. A submissão ocorre somente depois
que `TransactionTemplate` retorna do commit confirmado; não há callback que envie
em rollback. Rejeição entre commit e submissão mantém o contrato público e gera
aviso sanitizado, sem tentar compensar o commit.

Antes do HTTP, uma transação curta verifica token vigente, prazo, consumo e conta
ativa; encerra antes da rede. Tarefa obsoleta é descartada sem envio. Isso não torna
banco e Brevo atômicos: outro pedido pode invalidar o link durante o HTTP. E-mails
podem chegar fora de ordem; somente o token mais recente vale. A espera na fila
consome os 30 minutos originais, sem renovar prazo.

No fechamento do contexto, novas reservas/submissões são recusadas. Há até 30 s
para drenar; depois, tarefas ainda em fila são canceladas e as em execução são
interrompidas. O executor é encerrado antes da infraestrutura JPA da qual depende.
O prazo deve cobrir pelo menos um deadline HTTP efetivo; não garante drenar todo
um lote cheio (dez tarefas em dois workers podem exigir mais de 30 s).

Não há retry automático em 429, 5xx, timeout ou restart. Queda abrupta pode perder
trabalho em memória. Não há outbox, persistência do segredo, recuperação de fila
ou garantia de entrega durável/exatamente uma vez. O usuário pode pedir novo link.
Timeout pode representar aceite incerto; não reenviar automaticamente. Aceite é
somente 201 com `messageId` textual não vazio, não recebimento/leitura.
[Decisão](adr/0031-limitar-recuperacao-de-senha-em-memoria.md).

## Configuração

O backend importa `.env` do diretório de execução como propriedades. As chaves
maiúsculas abaixo têm mapeamento explícito em `application.properties`. Alterações
exigem reinício. O Compose passa as mesmas chaves; usar `--env-file backend/.env`
quando apropriado, sem presumir carregamento automático desse arquivo.

| Variável | Default e limites |
| --- | --- |
| `RECOVERY_FRONTEND_ORIGIN` | Se ausente, usa `ADMIN_FRONTEND_ORIGIN`; dedicada vazia/inválida desabilita emissão, sem fallback silencioso |
| `RECOVERY_WORKERS` | 2; inteiro 1–8 |
| `RECOVERY_QUEUE_CAPACITY` | 8; inteiro 0–64 |
| `RECOVERY_SHUTDOWN_SECONDS` | 30; inteiro 1–120; pelo menos `EMAIL_REQUEST_TIMEOUT_MS` em segundos |
| `RECOVERY_REQUEST_ORIGIN_LIMIT` | 30 pedidos em janela móvel de 10 minutos; 1–100 |
| `RECOVERY_RESET_ORIGIN_LIMIT` | 30 tentativas em janela móvel de 10 minutos; 1–100 |
| `RECOVERY_LIMITER_MAX_ENTRIES` | 10000 por mapa; 1–100000 |
| `RECOVERY_TRUSTED_PROXIES` | Vazia: usa somente peer da conexão; lista de até 32 IPs/CIDRs confiáveis, separados por vírgula |

Preferir em produção `RECOVERY_FRONTEND_ORIGIN=https://project-piec-4.vercel.app`.
A origem vem de configuração privada confiável, nunca Host/Origin do pedido.
Aceita HTTPS, e HTTP somente em `localhost`/`127.0.0.1`; uma barra final de raiz é
normalizada. Credenciais, caminho arbitrário, query, fragmento e porta inválida
são recusados. Origem ou configuração do transporte inválida gera um WARN por
inicialização, impede emissão e preserva outros módulos. Números inválidos
impedem boot com erro sanitizado. Reutiliza `BREVO_API_KEY`, `EMAIL_FROM`,
`EMAIL_FROM_NAME`, `EMAIL_CONNECT_TIMEOUT_MS` e `EMAIL_REQUEST_TIMEOUT_MS`.
`NOTIFICATIONS_EMAIL_ENABLED` não controla recuperação. Convites não mudam.

## Limitação e proxies

Antes de consultar a conta, pedidos com e-mail canônico têm intervalo mínimo de
60 s e até cinco admissões em janela móvel de uma hora. A política é idêntica para
e-mails válidos conhecidos/desconhecidos/inelegíveis. Todo pedido válido conta
na janela por origem, inclusive se depois for suprimido por e-mail/configuração/
capacidade; uma admissão na janela de e-mail também pode não emitir por esses
motivos. Não há bloqueio da conta para login. Supressão de pedido mantém 202,
mesmo corpo e cabeçalhos, sem `Retry-After` que diferencie elegibilidade.

Há mapas separados para e-mail, origem de pedido e origem de reset, sincronizados,
com expiração por janela, limpeza preguiçosa e teto explícito. Quando cheio, um
mapa recusa novas chaves; não expulsa entradas ainda ativas para admitir ataque.
Chaves são dados privados em memória, nunca logs. Restart zera contadores; não há
coordenação entre réplicas. Compose descreve um backend; a quantidade real de
instâncias Render não é comprovada pelos arquivos e deve ser confirmada pelo
mantenedor. Múltiplas réplicas exigem nova avaliação da política.

`server.forward-headers-strategy=NONE` evita confiança implícita em cabeçalhos.
O resolvedor de recuperação usa `remoteAddr` por padrão, ignorando X-Forwarded-For.
Se o peer estiver numa lista explicitamente confiável, percorre a cadeia da direita
para a esquerda enquanto cada intermediário for confiável e escolhe o primeiro
não confiável; cadeia inválida/excessiva retorna ao peer. Não usa DNS ou cabeçalhos
alternativos para identificar o cliente. Lista vazia atrás de proxy pode agregar
usuários no mesmo limite, uma restrição conservadora, não proteção por cliente.
No Render, confirmar com o mantenedor a cadeia e CIDRs reais e as restrições de
acesso direto antes de configurar a lista. Não usar `0.0.0.0/0`, `::/0` ou confiar
em todas as redes privadas por suposição. Não publicar IPs de usuários para validar.

Resposta assíncrona evita aguardar o provedor. Conta conhecida ainda tem trabalho
de banco diferente da desconhecida; tempo indistinguível não foi demonstrado.
Não há sleep artificial nem alegação de conformidade completa com OWASP.

## Diagnóstico sanitizado

Reutiliza o [logger compartilhado](observability.md) e operação `PASSWORD_RECOVERY`.
Estágios novos: PREPARATION, ADMISSION, SUBMISSION e EXECUTION, além dos estágios
do transporte. Configuração inválida avisa uma vez; saturação, rejeição de
submissão, falha de tarefa e cancelamento no shutdown avisam no máximo uma vez
por motivo a cada cinco minutos. Abuso/supressão normal e sucesso não geram
INFO/WARN por pedido. Transporte é dono de seu registro terminal; a tarefa não
repete WARN quando a observação já foi concluída. Não há exceção bruta/stack trace
operacional, destinatário, IP, conta, senha, token/hash, link ou payload nos eventos.

No console privado Render, filtrar `operation=PASSWORD_RECOVERY` (campo JSON em
prod), correlacionar `send_id` aleatório e conferir `stage`, `reason`, `category`
e duração. PREPARATION/recovery_configuration_invalid pede revisão da origem e
configuração Brevo; ADMISSION/recovery_capacity_exhausted indica capacidade;
SUBMISSION/recovery_submission_rejected indica encerramento/rejeição;
EXECUTION/recovery_task_failed indica falha interna/preflight; demais categorias
CONFIGURATION/PERMANENT/TRANSIENT/UNCERTAIN seguem o guia do transporte. Ausência
de WARN não comprova envio: pedido pode ter sido suprimido. DEBUG temporário é
sanitizado; restaurar WARN, sem ativar wire/headers/body.

## Frontend e validação local

`/esqueci-minha-senha` tem confirmação genérica e “Solicitar novamente” após
60 segundos locais; timer não consulta a API e não substitui os limites backend.
`/redefinir-senha#token=…` captura token somente em memória e remove o fragmento.
Abrir não consome. Recarga sem fragmento orienta reabrir o e-mail ou pedir outro;
não há persistência de token em storage/cache. Senha inválida permite correção;
respostas incertas orientam tentar login com a nova senha antes de repetir.

Meta referrer global e header `Referrer-Policy: no-referrer` no Nginx e no artefato
Vercel protegem navegação; homologar o header efetivo após publicação. Não há
analytics/telemetria coletando fragmentos nem scripts novos nesse fluxo.

Com JDK 21, Docker, FFmpeg/FFprobe e Node/pnpm fixados, executar `./mvnw verify`
em backend/ e `pnpm test`, `pnpm run lint`, `pnpm run build` em frontend/.
Testes usam PostgreSQL descartável, relógio controlado e HTTP loopback com o
adaptador de recuperação real, sem Brevo real. Cobrem limites/expiração/concorrência,
origem dedicada/fallback via arquivo de propriedades, capacidade/encerramento,
rollback/commit falho, token obsoleto, logs sanitizados e o núcleo transacional.
Os testes não substituem a homologação de recebimento, tracking ou topologia.

## Roteiro manual e homologação pelo mantenedor

Preparar banco local isolado/RSA, backend/frontend e uma conta sintética ativa;
para envio real usar apenas caixa própria/autorizada e publicação revisada.
Não reduzir validade em produção ou editar token no banco compartilhado.

1. Entrar com a conta ativa e manter outra sessão em navegador separado. Sair
   em um navegador, pedir recuperação e conferir confirmação genérica/foco.
2. Pedir com endereço inexistente: mesma confirmação, sem revelar elegibilidade.
   Após 60 s, “Solicitar novamente” habilita; novo pedido admitido invalida o anterior.
3. Abrir link anterior: reset é recusado. Abrir o atual não altera a senha;
   conferir fragmento removido, teclado/labels e senha/confirmar senha.
4. Enviar senha válida: sucesso oferece login. Senha antiga falha, nova funciona;
   a sessão aberta antes do reset recebe 401 na próxima chamada privada.
5. Reutilizar link consumido: erro com novo pedido disponível. Link ausente ou
   recarga após remover fragmento: orientação para reabrir e-mail/solicitar outro.
6. Expiração exata é coberta por relógio nos automatizados. Na homologação
   específica, guardar link privadamente por 30 min e tentar depois: deve falhar.
7. Simular perda de rede somente no navegador/ambiente local isolado durante
   reset: UI não garante rollback e orienta testar a nova senha antes de repetir.
8. Conferir 360 px e desktop, zoom 200%, Tab/Shift+Tab, foco de erro/sucesso,
   labels, mensagens associadas, alvo de toque e ausência de overflow.

Checklist externo separado, a executar pelo mantenedor:

- Revisar diff e autorizar história/publicação; pipeline e deploy pelo fluxo
  vigente, backend/Flyway antes de frontend. Confirmar aplicação de V15 sem editá-la.
- No Render, configurar origem dedicada acima e credenciais compartilhadas;
  confirmar instância única, proxies confiáveis e prazo de encerramento efetivo.
- Brevo: liberação transacional, remetente, quota e tracking de links sensíveis
  conforme [transporte](transactional-email.md); chave REST somente no backend.
- Despertar `https://piec-4-project.onrender.com/api/health` e aguardar saúde;
  homologar em `https://project-piec-4.vercel.app/` com caixa autorizada.
- Confirmar recebimento, remetente, spam, rota/domínio e link íntegro sem divulgar
  token; conferir header no-referrer e ausência de coleta por ferramentas externas.
- Repetir o roteiro funcional e correlacionar falhas por operação/estágio/categoria.
  Separar pedido 202, tentativa, aceite Brevo e recebimento. Não anexar links válidos.
- Registrar versão e evidências sanitizadas na MR/issue; usar Refs #20 enquanto
  revisão ou homologação obrigatória estiver pendente.

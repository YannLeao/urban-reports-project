# Entrega de notificações por e-mail

Cada **nova inserção** em `occurrence_notifications`, após a instalação da V12,
cria uma entrega em `occurrence_notification_email_deliveries` na mesma transação.
O destinatário é o mesmo da central. Hoje são as transições Pendente → Em análise,
Em análise → Resolvida e rejeição a partir de Pendente/Em análise, para o autor.
Cadastro, edição, exclusão e leitura não criam eventos adicionais. Não há backfill,
consulta por data, limpeza automática ou alteração das mensagens antigas. Uma
notificação com data histórica inserida após o corte também é capturada.

O consumidor roda no próprio backend, com scheduler de uma thread exclusivo,
fixedDelay e lote sequencial limitado. Reserva um item imediatamente antes de
processá-lo; PostgreSQL/`SKIP LOCKED` coordenam instâncias. Locks e conexões das
transações curtas são liberados antes da rede. O resultado usa estado/token de
posse e prazo de reserva; resposta tardia não sobrescreve reconciliação.
Histórico e outbox anteriores permanecem intactos. [Decisão: ADR 0023](adr/0023-entregar-notificacoes-por-email-com-intencao-duravel.md).

## Conteúdo e elegibilidade

Assunto fixo: “Atualização do seu relato — Alô Cidade”. Texto genérico:
“Há uma atualização no seu relato. Entre no Alô Cidade para consultar os detalhes.”,
link privado e identificação Alô Cidade. Não copiar `notification.message`, título,
justificativa, nome, imagem, localização ou qualquer texto fornecido pelo usuário.
Um destinatário por chamada, sem CC/BCC. Reutiliza o [transporte Brevo](transactional-email.md).

O endereço atual vem de `user_accounts` pelo destinatário da notificação. Conta
deve existir, ser USER exato e ACTIVE; inconsistências viram SUPPRESSED. Não há
sessão simulada: expiração/revogação de sessão não impede o aviso. A verificação
é feita em leitura curta antes de enviar, sem garantir atomicidade com uma
alteração de conta durante a rede. Não existem preferências ou verificação de
caixa postal nesta entrega.

URL: origem canônica + `/meus-relatos/{occurrenceId}`. HTTPS obrigatório, HTTP
somente localhost/127.0.0.1; sem barra final, caminho, userinfo, query ou fragmento
na origem. UUID identifica recurso e não autoriza acesso. Login e retorno seguro,
papel USER, autoria, no-store e 404 uniforme continuam nas rotas existentes.
Não usar rota pública para rejeitados. Abrir/aceitar e-mail não altera `read_at`.
Texto simples não comprova tracking desativado; preservar homologação Brevo.

## Configuração

| Variável | Default e faixa |
| --- | --- |
| `NOTIFICATIONS_EMAIL_ENABLED` | `false`; aceita `true`/`false`; controla só consumo |
| `NOTIFICATIONS_FRONTEND_ORIGIN` | vazia; exemplo local/Compose `http://localhost:5173`; independente da origem de convites |
| `NOTIFICATIONS_EMAIL_POLL_INTERVAL_MS` | `60000`, de 1000 a 3600000 ms; também atraso inicial |
| `NOTIFICATIONS_EMAIL_BATCH_SIZE` | `3`, de 1 a 20; reserva individual, processamento sequencial |
| `NOTIFICATIONS_EMAIL_LEASE_MS` | `60000`, até 3600000 ms e no mínimo `EMAIL_REQUEST_TIMEOUT_MS + 30000` |

Reutiliza `BREVO_API_KEY`, `EMAIL_FROM`, `EMAIL_FROM_NAME`,
`EMAIL_CONNECT_TIMEOUT_MS` e `EMAIL_REQUEST_TIMEOUT_MS`, sem outra credencial.
Configuração numérica/switch inválida falha no boot com mensagem sanitizada.
Origem/chave/remetente ausentes ou inválidos impedem **novas reservas**, mantendo
PENDING. Boot sem credencial continua possível; nenhuma chamada de rede ocorre
no preflight. Valores mudam somente após reinício/redeploy. Não expor em VITE.
Compose passa explicitamente as variáveis; não importa `backend/.env` sozinho.

Desligar consumo preserva a captura; pendências novas não expiram por idade.
Os schedulers `notificationEmailScheduler` e `uploadRecoveryScheduler` são
qualificados explicitamente. `IMAGE_RECOVERY_ENABLED=false` não desativa e-mail.
Bootstrap administrativo força ambos os consumidores desligados.

## Estados e recuperação

| Estado | Significado |
| --- | --- |
| PENDING | Não reservado ou liberado manualmente para nova tentativa |
| PROCESSING | Reserva confirmada; token opaco, `reserved_at`, `lease_until` e `send_id` |
| ACCEPTED | Aceite comprovado/persistido ou confirmado explicitamente pelo operador; terminal, sem reemissão |
| FAILED | Falha conhecida, incluindo CONFIGURATION/PERMANENT/TRANSIENT; sem retry automático |
| UNCERTAIN | Aceite possível, reserva vencida ou trabalho abandonado; reconciliar antes de reemitir |
| SUPPRESSED | Conta inelegível/inconsistente; terminal nesta issue; aviso interno preservado |

Há **uma chamada por tentativa**, sem retry automático, inclusive para 429/5xx.
Aceite não prova recebimento/leitura. Reserva vencida vira UNCERTAIN, nunca PENDING;
o prazo não cancela POST anterior. Queda após aceite e antes de gravar resultado
permanece ambígua. Falha de gravação não dispara outro POST nem declara resultado
persistido: interrompe o lote e conserva a reserva até expiração/reconciliação.
O coletor de reservas roda somente com consumo ligado, antes do preflight, em
lotes limitados; por isso também pode reconciliar abandono com Brevo sem configuração.
Interrupção/shutdown impede reservas novas e preserva a flag de interrupção.

`reservation_attempts` conta reservas operacionais, mesmo sem despacho HTTP;
`EmailObservation.attempts` permanece 0/1 por observação. Cada reserva recebe
`send_id` aleatório novo. `version` incrementa em cada mudança e protege ações
operacionais concorrentes. Não se armazenam endereço, texto, link, resposta ou
messageId do provedor na fila. Campos opcionais sem valor aparecem como `-` na CLI.

Não há garantia de ordem de e-mail nem prazo enquanto o processo estiver suspenso.
O estado atual e todos os detalhes ficam no app. Pendências no Neon sobrevivem
a restart/suspensão do Render; scheduler Java não acorda um processo suspenso.
O plano efetivo deve ser conferido pelo mantenedor; a [documentação Render Free](https://render.com/docs/free)
descreve suspensão por inatividade. Não há keep-alive ou infraestrutura adicional.

## Ferramenta operacional privada

Em `backend/`, com Java 21 e o Wrapper:

```bash
./mvnw verify
java -jar target/urban-reports-0.0.1-SNAPSHOT.jar --notification-email-ops help
```

A opção precisa ser o primeiro argumento. Esse caminho não cria Spring context,
servidor, scheduler ou Flyway, não importa `.env`, não pede RSA/Brevo e não envia
e-mail. `help` não abre banco. Se o JAR executado for `/app/app.jar` da imagem,
substitua somente o caminho. Execute de máquina privada com acesso autorizado
ao banco; não pressupor Shell/one-off job no plano Render usado.

Credenciais são fornecidas exclusivamente em ambiente privado, não em argumentos
literais, histórico de shell, screenshot ou evidência. Para configuração interativa
em Bash, com tracing desativado e sem copiar os valores:

```bash
read -r -p 'JDBC URL privada: ' NOTIFICATION_OPS_DB_URL
read -r -p 'Usuário privado: ' NOTIFICATION_OPS_DB_USERNAME
read -r -s -p 'Senha privada: ' NOTIFICATION_OPS_DB_PASSWORD
export NOTIFICATION_OPS_DB_URL NOTIFICATION_OPS_DB_USERNAME NOTIFICATION_OPS_DB_PASSWORD
java -jar target/urban-reports-0.0.1-SNAPSHOT.jar --notification-email-ops counts
java -jar target/urban-reports-0.0.1-SNAPSHOT.jar --notification-email-ops list --state=FAILED --offset=0 --size=20
```

Usar URL JDBC PostgreSQL com TLS conforme o ambiente. A posse privada de credenciais
autorizadas é a autorização operacional; não há autenticação HTTP adicional.
Para consulta, preferir usuário do banco limitado a SELECT na tabela de entregas.
Recuperação precisa de SELECT/UPDATE nessa tabela e INSERT na tabela de auditoria
`notification_email_operator_actions`; não conceder DDL, DELETE ou privilégio de
aplicação administrativa só para operar esta ferramenta. Gestão dessas credenciais
cabe ao mantenedor; não é provisionada automaticamente.

`counts` mostra todos os estados. `list` sem filtro mostra todos, com offset
0–1000000 e size 1–100 (default 20); ordena por criação/id. A saída privada contém
somente ID da entrega, estado/versão, contador/datas/reserva, diagnóstico/categoria,
status HTTP e send_id. Não expõe IDs de conta/relato/notificação, e-mail ou texto.
Não publicar essa listagem; logs normais sequer contêm o ID da entrega.

Após corrigir a causa, liberar **um** FAILED usando ID e versão da consulta:

```bash
java -jar target/urban-reports-0.0.1-SNAPSHOT.jar --notification-email-ops reconcile \
  --id=UUID_DA_ENTREGA --state=FAILED --version=VERSAO_CONSULTADA \
  --action=RELEASE --reason=CONFIGURATION_FIXED
```

UNCERTAIN requer antes encerrar/verificar o processo antigo e aguardar esgotar
a janela de rede. Lease vencida/token de posse não impedem POST tardio. Não
informar a flag de confirmação apenas porque o prazo venceu. Consultar o painel
privado Brevo pela tentativa/horário/destinatário conhecido pelo operador, sem
copiar dados para logs. Não existe reconciliação automática com o provedor.

Confirmar aceite comprovado no painel:

```bash
java -jar target/urban-reports-0.0.1-SNAPSHOT.jar --notification-email-ops reconcile \
  --id=UUID_DA_ENTREGA --state=UNCERTAIN --version=VERSAO_CONSULTADA \
  --action=CONFIRM --reason=PROVIDER_RECONCILED --previous-attempt-stopped=true
```

Ou liberar conscientemente uma reemissão que **pode duplicar**:

```bash
java -jar target/urban-reports-0.0.1-SNAPSHOT.jar --notification-email-ops reconcile \
  --id=UUID_DA_ENTREGA --state=UNCERTAIN --version=VERSAO_CONSULTADA \
  --action=RELEASE --reason=DUPLICATE_RISK_ACKNOWLEDGED \
  --previous-attempt-stopped=true --acknowledge-duplicate-risk=true
unset NOTIFICATION_OPS_DB_URL NOTIFICATION_OPS_DB_USERNAME NOTIFICATION_OPS_DB_PASSWORD
```

A CLI somente altera o estado, não envia diretamente. Não aceita reabrir ACCEPTED,
PROCESSING ou SUPPRESSED, nem reprocessamento em massa. Um PROCESSING vencido deve
primeiro passar pelo coletor para UNCERTAIN; não editar SQL manualmente. Desligar
consumo durante triagem não apaga nenhuma intenção. Depois de estabilizar/encerrar
o processo anterior, o mantenedor pode ligar o consumidor para coletar leases e
seguir a reconciliação explícita. PENDINGs legítimos serão consumidos se a
configuração estiver pronta; considerar isso antes de religar.

Sucesso mutante: `UPDATED 1`; conflito de estado/versão: `CONFLICT 0`, sem mudança
ou envio. Audit trail na mesma transação guarda entrega, versão/estado anteriores,
ação, motivo controlado e data. Não contém texto livre. Códigos de saída: 0 sucesso,
2 argumentos/configuração inválidos, 3 conflito, 4 falha de banco/resultado não
confirmado. Em código 4, consultar antes de repetir: commit pode ter sido aceito
com perda de resposta. Os argumentos inválidos e exceções não são reproduzidos.

## Verificação local e harness

Sem contas/chaves reais, em `backend/`, com JDK 21 e Docker:

```bash
./mvnw -Dtest=NotificationEmailIntegrationTests,NotificationEmailConfigurationTests,NotificationEmailWorkerTests test
./mvnw -Dtest=BrevoEmailSenderTests,EmailObservabilityTests,EmailLoggingConfigurationTests,AdminProvisioningIntegrationTests,NotificationIntegrationTests,OccurrenceHistoryIntegrationTests test
./mvnw verify
```

O harness usa PostgreSQL descartável e transporte injetado. O teste
`disabledAccumulatesAndAcceptedIsNeverResentAndContainsOnlyPrivateLink` demonstra
PENDING com consumo desligado, e-mail atual/sem sessão, texto mínimo, ausência de
transação/conexão durante rede, ACCEPTED e ciclos sem reenvio. O teste
`independentWorkersReserveOnceAndExpiredLeaseNeverResendsOrAcceptsLateCompletion`
usa latches/Clock para queda/expiração sem esperar um minuto. Os testes de
operações consultam/reconciliam esse banco descartável e comprovam versões,
flags, auditoria e recusas. Brevo usa HTTP loopback para contrato, perda de resposta,
201 inválido, deadline e um POST. Não existe endpoint alternativo configurável em
produção para “testar” este fluxo. Os bancos do harness são removidos pelo
Testcontainers; não executar a CLI posteriormente com URLs já encerradas.

Para conferir a CLI contra um banco local descartável mantido pelo operador,
inicie a aplicação local com DB/RSA sintéticos conforme os guias existentes e
consumidor desligado. Cadastre cidadão e faça transição com ADMIN legítimo;
`counts`/`list` devem mostrar PENDING. Sem configurar Brevo real, deixar consumo
ligado com origem válida e remetente/chave vazios preserva PENDING e emite um
diagnóstico CONFIGURATION, sem envio. As provas mutantes de FAILED/UNCERTAIN
continuam no harness acima; não adulterar banco/credenciais compartilhados para
fabricar falhas. Não remover volumes ou resetar contas reais.

## Publicação e homologação Render pelo mantenedor

1. Após revisão/pipeline, publicar migration/código com
   `NOTIFICATIONS_EMAIL_ENABLED=false`. Conferir SHA, saúde e Flyway V12; legados
   não devem ter entregas retroativas. Capture começa no deploy, mesmo desligado.
2. Com USER e caixa de teste sob controle, registrar relato novo; ADMIN move para
   Em análise. Confirmar aviso interno e PENDING com CLI privada, sem publicar IDs.
3. No backend Render definir `NOTIFICATIONS_FRONTEND_ORIGIN=https://ORIGEM_VERCEL`,
   `NOTIFICATIONS_EMAIL_ENABLED=true`, `NOTIFICATIONS_EMAIL_POLL_INTERVAL_MS=60000`,
   `NOTIFICATIONS_EMAIL_BATCH_SIZE=3`, `NOTIFICATIONS_EMAIL_LEASE_MS=60000`.
   Conferir Brevo/remetente/tracking existentes e deadline padrão 10000. Salvar e
   aplicar reinício/redeploy da versão aprovada; frontend não precisa rebuild.
4. Com processo acordado, aguardar um ciclo/processamento. Conferir ACCEPTED no
   banco e recebimento/spam separadamente; aceite isolado não prova recebimento.
   Estado de leitura/contador internos continuam independentes.
5. Abrir link sem sessão: login e retorno ao detalhe. Com outro USER, negar/404
   uniforme. Abrir link não marca como lida. Validar resolução e rejeição em
   relatos de teste apropriados: e-mail genérico, detalhes somente no app; rejeitado
   continua privado do autor.
6. Novos ciclos/restart não reenviam ACCEPTED. Falhas, lease e reconciliação são
   ensaiadas em banco descartável; não trocar chave nem provocar indisponibilidade
   compartilhada. Para pendência real, seguir triagem/CLI acima; se necessário,
   desligar só consumo. Não apagar tabelas, histórico, contas ou migrations.
7. Compartilhar versão, UTC, estado/categoria e logs sanitizados; nunca endereço,
   IDs de domínio, URLs, listagens, mensagens ou credenciais. Recebimento real,
   plano Render e prazo durante operação dependem da evidência do mantenedor.

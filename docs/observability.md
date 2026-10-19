# Observabilidade segura de e-mail

O fluxo de [e-mail transacional](transactional-email.md) registra diagnóstico
permanente no console, sem adicionar endpoints, infraestrutura ou chamadas externas.
A instrumentação permite investigar falhas; sua presença não comprova a causa de
uma falha em produção nem recebimento da mensagem.

## Configuração efetiva

Spring Boot 4.1.1 usa SLF4J 2 e Logback existentes. Logger exclusivo:
`com.project.software.urbanreports.email.observability`.

| Configuração | Comportamento |
| --- | --- |
| `logging.level.com.project.software.urbanreports.email.observability=WARN` | Base de todos os perfis; uma linha terminal por falha, sucesso silencioso |
| `logging.pattern.level=%5p %kvp` | Console textual da base/dev inclui os campos SLF4J, mantendo o restante do layout nativo |
| `logging.structured.format.console=logstash` | Perfil `prod`: JSON nativo, uma linha por evento em stdout; inclui campos chave/valor |
| `LOGGING_LEVEL_COM_PROJECT_SOFTWARE_URBANREPORTS_EMAIL_OBSERVABILITY=DEBUG` | Override nativo para o logger inteiro em minúsculas; não habilita DEBUG dos demais módulos |
| `LOGGING_STRUCTURED_FORMAT_CONSOLE=logstash` | Override nativo para JSON também sem perfil ou em dev |

Não existe `logback-spring.xml`, arquivo local de logs ou mudança do nível root.
Startup e falhas dos demais módulos continuam visíveis. A propriedade de padrão
textual não interfere no encoder JSON. Overrides externos de formato/padrão,
nível ou `logging.config` podem substituir estes defaults; conferir a configuração
implantada sem exportar ambiente. O teste `EmailLoggingConfigurationTests` inicia
JVMs reais com ambiente sintético e sem importar `.env`: comprova WARN/JSON em
prod, DEBUG restrito por variável, campos no texto dev e override de formato.

As variáveis acima são variáveis de processo do serviço. Para execução local,
prefira exportá-las no shell. O `.env` opcional do backend é importado como
**propriedades**: nesse arquivo use as chaves `logging.level.…` e
`logging.structured.format.console` literais, sem presumir conversão automática
de nomes de variáveis. Reinicie após alterar configurações. Compose não passa
automaticamente variáveis novas nem importa o `.env` das aplicações.

Não habilitar `debug=true`, TRACE global, SQL/bindings, logs JDK de HTTP,
headers/body/wire ou diagnóstico TLS bruto. Não abrir Actuator loggers/env.
Não mudar timeouts, retries, TLS ou redirects para investigar este fluxo.

## Eventos e limites

Cada tentativa lógica começa **após commit**, antes da preparação do link; para
uso genérico do transporte, começa na entrada de `send`. Termina no aceite ou
falha observada, antes da conversão para `mailStatus`. `duration_ms` usa relógio
monotônico e inclui preparação/validação/serialização, rede e validação da
resposta; não inclui transação de persistência. Não se confunde com o deadline
exclusivo da rede. Uma falha de commit não inicia observação de envio.

Em WARN há exatamente um `email.send.completed` por falha e nenhuma linha por
aceite. Em DEBUG há **até duas linhas por tentativa**: `email.send.dispatched`
(quando alcançado) e `email.send.completed`. Não há eventos por byte, polling,
health check ou sucesso em INFO. Não há evento de configuração no boot.

O contexto é passado explicitamente serviço → adaptador → transporte, sem MDC,
ThreadLocal ou cabeçalho público. O transporte completa o registro antes de
descartar causas. O serviço completa somente se ainda não houve evento terminal,
inclusive em erro de preparação. Reenvio recebe contexto/UUID novo. Nenhum
Throwable, payload ou resposta fica armazenado no contexto. Falhas RuntimeException
do logger são isoladas para não converter aceite em falha nem impedir persistência.

| Campo | Valores/semântica |
| --- | --- |
| `event` | `email.send.dispatched` ou `email.send.completed` |
| `send_id` | UUID aleatório novo por tentativa, sem relação com dados do domínio |
| `operation` | `ADMIN_INVITATION`, `ADMIN_RESEND`, `OCCURRENCE_NOTIFICATION`, `GENERIC` |
| `provider` | `brevo` |
| `outcome` | Só terminal: `ACCEPTED`, `FAILED`, `UNCERTAIN` (este último continua FAILED na API) |
| `category` | Só falha: `CONFIGURATION`, `PERMANENT`, `TRANSIENT`, `UNCERTAIN`; regras anteriores preservadas |
| `stage` | Último ponto observado, descrito abaixo |
| `reason` | Só terminal: enum de motivos abaixo, nunca texto externo |
| `http_status` | Inteiro 100–599, somente com resposta completa disponível |
| `provider_code` | Só rejeição HTTP: `invalid_parameter`, `missing_parameter`, `unknown_provider_code` |
| `duration_ms` | Inteiro não negativo; intervalo monotônico descrito acima |
| `attempts` | 0 antes de chamar sendAsync, 1 quando seu despacho é iniciado; não conta retries |

Metadados nativos do Boot (timestamp, nível, logger, thread, versão do formato)
também aparecem. Não há campo `cause_type` nem identidade pessoal. Somente
constantes/enums, números controlados e UUID gerado entram nos campos próprios.
Não se passa Throwable ao logger, nem mensagem de exceção, headers, endereço,
messageId, URL/link, token, nome, ID de conta ou hash desses dados.

| Estágio | Evidência |
| --- | --- |
| `PREPARATION` | Preparação/validação da origem do link, após persistir convite |
| `VALIDATION` | Validação local da configuração do transporte |
| `SERIALIZATION` | Serialização/composição local da requisição |
| `DISPATCH` | Chamada ao HttpClient iniciada, sem resposta completa disponível |
| `RESPONSE_VALIDATION` | Future entregou status e corpo completos; validação do resultado |

A leitura do corpo/future existente permanece intacta. Não há medição separada
de DNS/TCP/TLS nem observação dos headers intermediários: deadline durante corpo
ou antes dos headers fica `DISPATCH`, sem status. `attempts=1` não comprova que
o provedor recebeu bytes. Não se infere conexão recusada/reset por texto de
exceção: `ConnectException` é `connect_failed`; EOF comprovável é
`connection_closed`; outros I/O ficam genéricos.

| Motivo | Evidência/limite |
| --- | --- |
| `accepted` | 201 com messageId textual não vazio; somente DEBUG |
| `configuration_missing`, `configuration_invalid` | Validação local da configuração, sem valores |
| `activation_link_preparation_failed` | Falha ao preparar/validar origem/link |
| `notification_link_preparation_failed` | Falha ao preparar link privado de notificação; não é convite |
| `serialization_failed` | Falha local ao serializar/compor requisição |
| `dns_resolution_failed` | UnknownHostException identificada |
| `connect_timeout`, `connect_failed` | HttpConnectTimeoutException, ConnectException respectivamente |
| `tls_handshake_failed` | SSLHandshakeException; sem prova específica de certificado |
| `tls_certificate_validation_failed` | CertificateException na cadeia examinada |
| `request_deadline_exceeded` | TimeoutException ou HttpTimeoutException; não determina fase da conexão |
| `interrupted`, `cancelled` | Interrupção/cancelamento identificado; flag de interrupção preservada |
| `provider_http_rejected` | Status diferente de 201 |
| `response_invalid_json`, `response_missing_message_id` | Resposta 201 inválida ou sem ID utilizável |
| `connection_closed`, `io_failure`, `unknown_failure` | EOF, I/O genérico ou evidência insuficiente |

A cadeia de causas tem limite de 16 objetos e proteção contra ciclos. Não lê
mensagens nem suppressed. Wrappers não mudam a regra antiga de categoria: na
ExecutionException somente a causa imediata ConnectException, timeout de conexão
ou handshake é TRANSIENT; as demais são UNCERTAIN. Cancelamento direto mantém a
categoria CONFIGURATION do catch RuntimeException anterior. Motivo acrescenta
evidência sem alterar essa semântica. Timeouts inválidos continuam impedindo boot,
sem tentativa de envio; não são diagnosticados como tentativa.

Somente dois códigos da [lista oficial Brevo](https://developers.brevo.com/docs/how-it-works)
são reconhecidos. Valores desconhecidos, ausentes, JSON inválido ou corpo maior
que **4096 caracteres** tornam-se `unknown_provider_code`. Nunca se usa `message`.
O parse auxiliar não acrescenta leitura de rede e não altera categoria/status;
usa o corpo já obtido dentro do deadline existente. O limite é do parse auxiliar,
não um novo limite do corpo HTTP: a leitura completa anterior não foi refatorada.

Exemplos fictícios de linhas terminais (metadados nativos omitidos por brevidade):

```json
{"event":"email.send.completed","send_id":"00000000-0000-4000-8000-000000000001","operation":"ADMIN_INVITATION","provider":"brevo","outcome":"FAILED","category":"PERMANENT","stage":"RESPONSE_VALIDATION","reason":"provider_http_rejected","http_status":403,"provider_code":"unknown_provider_code","duration_ms":112,"attempts":1}
{"event":"email.send.completed","send_id":"00000000-0000-4000-8000-000000000002","operation":"ADMIN_RESEND","provider":"brevo","outcome":"UNCERTAIN","category":"UNCERTAIN","stage":"DISPATCH","reason":"request_deadline_exceeded","duration_ms":10002,"attempts":1}
{"event":"email.send.completed","send_id":"00000000-0000-4000-8000-000000000003","operation":"GENERIC","provider":"brevo","outcome":"FAILED","category":"TRANSIENT","stage":"DISPATCH","reason":"tls_handshake_failed","duration_ms":84,"attempts":1}
{"event":"email.send.completed","send_id":"00000000-0000-4000-8000-000000000004","operation":"ADMIN_RESEND","provider":"brevo","outcome":"ACCEPTED","stage":"RESPONSE_VALIDATION","reason":"accepted","http_status":201,"duration_ms":210,"attempts":1}
```

## Consumidor de notificações externas

A operação `OCCURRENCE_NOTIFICATION` inicia o contexto após confirmar a reserva
e antes de resolver elegibilidade/preparar link. Inclui essa consulta curta no
tempo da tentativa, mas não reserva ou persistência final do resultado. O
`send_id` gerado aleatoriamente também fica na entrega para correlação privada;
não é ID do evento/conta. `reservation_attempts` na fila é outro contador e não
altera o `attempts` 0/1 do transporte. Supressão não anuncia tentativa de rede.

Além dos terminais de transporte, o mesmo logger emite o evento operacional
`notification.email.operational`, com `condition` em allowlist:
`CONFIGURATION`, `DATABASE`, `RESULT_NOT_SAVED`, `OWNERSHIP_LOST`, `LEASE_EXPIRED`,
`SCHEDULER`. `send_id` é opcional quando houver tentativa conhecida. Não há
Throwable, texto externo, ID da entrega ou outro dado de domínio. Configuração
imutável emite uma vez por processo; demais condições, no máximo uma vez por
cinco minutos por condição/processo, mesmo em polling repetido. São eventos
próprios, sem segunda conclusão do transporte. `RESULT_NOT_SAVED` após aceite
não comprova ACCEPTED persistido: consultar estado e seguir
[recuperação operacional](notification-email.md). Ciclos vazios/sucesso continuam
silenciosos em WARN, sem resumo INFO. Falha de logger não muda envio/estado.

## Triagem por evidência

| Observado | Comprova | Não comprova | Próxima verificação segura |
| --- | --- | --- | --- |
| Configuração/preparação, attempts=0 | Falha local anterior ao transporte | Problema de rede/Brevo | Revisar presença/validade de campos e origem em painel privado, sem copiar valores |
| HTTP 400/401/403/422 | Resposta HTTP rejeitada com status registrado | Causa raiz, chave errada ou bloqueio de IP específico | Conferir contrato, permissões, remetente e painel privado do provedor |
| HTTP 429/5xx | Resposta do provedor/transporte com esse status | Quota específica ou ausência de aceite em todos os casos | Conferir estado/limites/eventos privados; sem retry indiscriminado |
| DNS/connect/TLS | Tipo técnico conhecido na cadeia | Fase cronometrada, bloqueio do Render ou erro de chave | Conferir configuração/rede/status/certificados com operador autorizado; manter validação TLS |
| Deadline/EOF/I/O/interrupção | Não houve confirmação completa utilizável | Que a mensagem não foi aceita | Conferir eventos privados antes de reenviar |
| 201 inválido | HTTP 201 sem confirmação utilizável | Falha definitiva de entrega | Conferir painel do provedor antes de reemitir |
| ACCEPTED em DEBUG | Contrato de aceite satisfeito | Entrega, leitura ou ausência de tracking | Conferir caixa/spam e eventos privados |
| Nenhum evento | Ausência de registro localizado | Que Brevo foi chamada ou falhou | Conferir versão, nível/formato, horário e chegada ao fluxo após commit |

`mailStatus` e retornos 201/200 não ganham detalhes técnicos. Conta/convite
permanecem persistidos com falha; reenvio invalida o token anterior e mantém 24h.

## Verificação local

Com Java 21 e Docker local, em `backend/`:

```bash
./mvnw -Dtest=BrevoEmailSenderTests,EmailObservabilityTests,EmailLoggingConfigurationTests test
./mvnw -Dtest=AdminProvisioningIntegrationTests test
./mvnw verify
```

Usam somente dados sintéticos, HTTP loopback/transporte injetado e PostgreSQL
descartável. Cobrem logs renderizados, volume, correlação, causas, interrupção,
contratos administrativos e commit antes do envio. Não configurar chaves reais.
Para inspeção visual, executar a aplicação local conforme o guia administrativo,
sem BREVO_API_KEY/EMAIL_FROM: uma criação de teste retorna FAILED e um resumo
WARN VALIDATION/configuration_missing, attempts=0; reenvio usa outro send_id.
A prova local de aceite e erros externos é o servidor controlado dos testes.

## Homologação no Render pelo mantenedor

1. Revisar branch, diff e testes. Autorizar commit/merge/publicação explicitamente;
   seguir [deploy backend](backend-deployment.md). Registrar versão e horário UTC
   da publicação. A implementação local não executa esse procedimento externo.
2. No Dashboard Render, selecionar o **serviço backend** e abrir **Logs** do
   runtime, distinguindo-os dos logs de build. Confirmar versão e perfil `prod`:
   defaults geram JSON e WARN. Usar busca por `email.send.completed` e depois UUID.
3. Se WARN não bastar, em **Environment** desse serviço adicionar/ajustar
   `LOGGING_LEVEL_COM_PROJECT_SOFTWARE_URBANREPORTS_EMAIL_OBSERVABILITY=DEBUG`.
   Para garantir formato via override nativo, usar
   `LOGGING_STRUCTURED_FORMAT_CONSOLE=logstash` (já default no perfil prod).
   Salvar e aplicar a atualização com reinício/deploy da **mesma versão aprovada**;
   conferir o commit na opção oferecida pelo painel antes de confirmar. Aguardar
   serviço saudável; apenas salvar sem reinício não altera o nível em execução.
   Não alterar root, segredos ou frontend; não é necessário reconstruir frontend.
4. Com SUPER_ADMIN legítimo, fazer **uma** criação para caixa controlada/autorizada
   ou um reenvio se a conta já estiver pendente. Não repetir criação existente.
   Registrar ação e horário UTC sem publicar endereço. Esperado: mesmo contrato
   201/200 e ACCEPTED/FAILED, com no máximo duas linhas em DEBUG por tentativa.
5. Filtrar eventos e seguir o mesmo send_id. Conferir categoria, estágio, motivo,
   status/código quando disponíveis e duração. Comparar com a evidência local;
   não esperar reprodução local da mesma condição externa. Sem evento, conferir
   versão/logger e chegada ao envio antes de atribuir falha ao provedor.
6. Compartilhar apenas linhas sanitizadas, versão, UTC e ação. Em aceite sem
   recebimento, investigar entrega no painel privado/caixa/spam. Em resultado
   incerto, conferir painel **antes** de reenviar: outro convite invalida o anterior.
7. Retornar a variável de nível para `WARN`, salvar/aplicar e aguardar reinício.
   A instrumentação permanece no projeto. Encerrar somente dados de teste
   autorizados conforme o guia administrativo. Não inserir chave inválida no
   serviço compartilhado, desligar TLS ou manipular contas/banco alheios.

O [Render captura stdout/stderr do serviço](https://render.com/docs/logging).
Este guia não promete retenção, busca ou recursos de plano específicos. O suporte
nativo a logstash e aos níveis por variável é documentado pelo
[Spring Boot 4.1.1](https://docs.spring.io/spring-boot/reference/features/logging.html)
e verificado localmente; overrides e implantação remota precisam ser conferidos.

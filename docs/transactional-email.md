# E-mail transacional por HTTPS

Convites administrativos de Alô Cidade usam
`ActivationMailSender → TransactionalActivationMailSender → TransactionalEmailSender → BrevoEmailSender`.
O pacote compartilhado `email/` não conhece conta, sessão, papel ou token.
O transporte não cria endpoints, migrations, SDK ou fallback SMTP. Convites
permanecem síncronos; a #42 reutiliza a mesma interface em um
[consumidor com intenção persistida](notification-email.md), com operação própria.
#20 (recuperação) continua pendente. Ver [ADR 0022](adr/0022-enviar-email-transacional-via-brevo.md).

## Contrato, rede e dados sensíveis

[Contrato oficial](https://developers.brevo.com/reference/send-transac-email):
POST `https://api.brevo.com/v3/smtp/email`, header `api-key`, JSON UTF-8
`sender: {email,name}`, `to: [{email}]`, `subject`, `textContent`.
Somente HTTP 201 e `messageId` textual não vazio confirmam aceite. ID é resultado
interno e não deve ser publicado. TLS usa validação padrão do JDK; não seguir
redirects. Não existe variável de endpoint: o construtor alternativo tem acesso
de pacote e serve a testes controlados em loopback.

Envio é síncrono do ponto de vista do chamador. HttpClient envia um único POST,
sem loop de retry; não habilitar `jdk.httpclient.enableAllMethodRetry` em runtime.
Testes verificam contagem de requisições também para fechamento sem resposta,
redirects, 429 e 5xx. Nenhuma chave de idempotência é enviada e não se promete
entrega exatamente uma vez. Reenvio administrativo é nova operação de domínio,
com token novo, não mecanismo de retry do transporte.

Conexão limitada a 3 s por padrão, dentro do deadline de 10 s para aguardar a
resposta completa, incluindo o corpo. O future é cancelado ao exceder o deadline;
a interrupção preserva a flag do chamador. Não somar 3 + 10 como tentativas
sucessivas: não há orçamento de retries. O limite da rede não inclui validação,
serialização, transação do banco ou tempo de escalonamento do processo.

Criação confirma conta/token e libera locks antes de enviar; responde 201.
Reenvio confirma token novo e invalida o anterior antes de enviar; responde 200.
Ambos preservam `mailStatus: ACCEPTED|FAILED`. ACCEPTED significa aceite do
provedor, sem prova de recebimento/leitura. FAILED pode ocorrer após aceite com
perda de resposta. Persistência/commit falho nunca envia; falha de envio mantém
ADMIN pendente e o convite confirmado. Queda entre commit e envio pode perder
a tentativa; não há garantia durável nem transação distribuída. Mensagens podem
chegar fora de ordem; somente o token mais recente é válido por 24h da emissão.

Não há logs do transporte contendo corpo, destinatário, chave, link, token,
headers ou resposta bruta, nem exceções encadeadas. Mensagens, resultados e
adaptador redigem `toString()`. Não ativar logs JDK de headers/content/wire,
dumps HTTP, proxies de captura ou exportações públicas das mensagens. A [observabilidade segura](observability.md) registra categoria, estágio, motivo,
status/código permitido, duração, tentativas e correlação opaca. O logger dedicado
usa WARN por padrão e JSON no perfil prod; DEBUG temporário tem até duas linhas
por tentativa. O contrato HTTP administrativo continua expondo apenas FAILED.

| Categoria interna | Situação | Ação |
| --- | --- | --- |
| CONFIGURATION | Chave/remetente ausente ou inválido; timeout fora do intervalo | Corrigir configuração backend; não há chamada de rede |
| PERMANENT | 400/401/403/422, redirects ou status inesperado | Conferir chave REST, remetente, liberação e contrato em ambiente seguro |
| TRANSIENT | 429, 5xx, conexão recusada, timeout de conexão ou handshake TLS | Conferir quota/status/rede/TLS; sem retry automático |
| UNCERTAIN | Timeout de requisição, interrupção, perda de resposta, JSON inválido ou ID ausente em 201 | Não presumir que não enviou; confirmar no painel privado antes de reemitir |

As categorias não reproduzem detalhes do fornecedor. DNS/erros de I/O sem
certeza de aceite são tratados conservadoramente como UNCERTAIN. Não desabilitar
TLS para diagnóstico. Nem 5xx elimina totalmente a possibilidade de resultado
incerto no provedor; não reenviar automaticamente.

## Variáveis e carregamento

| Variável | Default | Uso |
| --- | --- | --- |
| BREVO_API_KEY | vazio | Segredo REST exclusivo do backend, não SMTP key |
| EMAIL_FROM | vazio | Endereço cadastrado/verificado na Brevo; sem remetente inventado |
| EMAIL_FROM_NAME | Alô Cidade | Nome de exibição |
| EMAIL_CONNECT_TIMEOUT_MS | 3000 | Inteiro de 1 a 30000 ms |
| EMAIL_REQUEST_TIMEOUT_MS | 10000 | Inteiro de 1 a 60000 ms, resposta completa |
| ADMIN_FRONTEND_ORIGIN | vazio no backend; http://localhost:5173 no exemplo/Compose | Origem sem barra final/path/query/fragmento; HTTPS, HTTP só localhost/127.0.0.1 |

Chave/remetente podem ficar vazios para boot e testes, respeitando banco e RSA
obrigatórios. Timeouts inválidos impedem inicialização com erro de configuração.
Não existe alias SMTP nem ADMIN_MAIL_FROM. `backend/.env.example` contém só
valores vazios e defaults seguros para este transporte.

Execução com diretório `backend/` importa opcionalmente seu `.env` como
propriedades; reiniciar após alterações. Compose interpola shell, `.env` da
raiz ou `--env-file`: **não importa backend/.env automaticamente**. Exemplo:
`docker compose --env-file backend/.env config --quiet` valida sem imprimir
valores; `docker compose --env-file backend/.env up --build` passa as variáveis
mapeadas. Conferir DB e caminhos RSA próprios para containers conforme README.
Não imprimir `docker compose config` sem `--quiet` com segredos reais.
Nunca colocar chave em VITE_*, build args, frontend, CI, logs ou Git.

## Preparação externa pelo mantenedor

1. Criar/acessar a conta Brevo da equipe e obter liberação para envio transacional.
   Verificar limites/bloqueios da conta; a implementação não comprova aprovação.
2. [Cadastrar e verificar o remetente](https://help.brevo.com/hc/en-us/articles/208836149-Create-a-new-sender-From-name-and-From-email)
   usando endereço sob controle da equipe. Não usar o placeholder como remetente.
3. [Gerar API key](https://help.brevo.com/hc/en-us/articles/209467485-Create-and-manage-your-API-keys)
   para a API REST, **não SMTP key**. Guardar em gerenciador de segredos e na
   configuração protegida do serviço backend Render, sem compartilhar no card.
4. No Render, configurar BREVO_API_KEY, EMAIL_FROM, EMAIL_FROM_NAME e a origem
   canônica Vercel em ADMIN_FRONTEND_ORIGIN; manter FRONTEND_ALLOWED_ORIGINS
   coerente conforme segurança. Usar defaults de timeout ou os limites acima.
   Não alterar banco, RSA ou credenciais de outros serviços.
5. Preparar o frontend com rota de ativação e papéis atuais; seguir deploy manual
   revisado conforme [backend](backend-deployment.md) e [frontend](frontend-deployment.md).
   Alterar apenas estas variáveis backend não exige rebuild frontend.

A Brevo documenta [substituição temporária de domínio não autenticado](https://help.brevo.com/hc/en-us/articles/16045394674066-Troubleshooting-Domain-authentication)
por domínio brevosend.com, inclusive para provedores gratuitos. Isso não garante
liberação ou entrega nesta conta. Não tentar autenticar onrender.com/vercel.app,
pois a equipe não controla seus DNS; aquisição de domínio está fora do escopo.
Conferir remetente efetivo, spam, bloqueios e políticas com a Brevo na homologação.

## Tracking de links sensíveis

O contrato REST consultado não oferece opção documentada para desligar tracking
por mensagem; não se enviam headers inventados. Texto simples não contém pixel
HTML no payload, mas não comprova ausência de transformação do link no provedor.
A opção oficial [Anonymous email tracking](https://help.brevo.com/hc/en-us/articles/11643306229906-Can-I-anonymize-the-tracking-of-opens-and-clicks-for-my-emails)
em **Settings → Automations → Transactional emails → Tracking → Yes → Save**
apenas anonimiza eventos: não desliga tracking nem garante ausência de reescrita.

Antes de homologar links de ativação, o mantenedor deve solicitar ao suporte
Brevo a desativação de click/open tracking para o envio transacional da conta,
confirmar disponibilidade no plano e verificar a mensagem recebida e o destino
integral do link, inclusive fragmento. A documentação pública consultada não
comprova toggle de desativação disponível nesta conta; não há ajuste local que
o substitua. Se indisponível, registrar o bloqueio para decisão do mantenedor,
sem declarar a proteção homologada. Não publicar mensagens/links para obter suporte.

## Roteiro verificável localmente

Pré-condições: Java 21, Docker acessível, Node 22.23.2/pnpm 10.34.5, dependências
pelo lockfile. Testes usam chave fictícia, HTTP loopback e PostgreSQL descartável,
sem internet/Brevo/banco remoto. Não apontar a aplicação para ambiente real.

1. Em backend/, executar `./mvnw -Dtest=BrevoEmailSenderTests test`.
   Esperado: composição em português/UTF-8/24h, URL intacta, contrato HTTP,
   aceite 201 com ID, falhas sanitizadas, ausência de redirects/repetições,
   conexão recusada e timeout aprovados. O servidor encerra a cada teste.
2. Executar `./mvnw -Dtest=AdminProvisioningIntegrationTests test` e `./mvnw verify`.
   Esperado: envio fora da transação após commit; commit falho não envia;
   201/200 FAILED preservam pendência; reenvio falho invalida anterior;
   expiração exclusiva em 24h simulada por Clock, uso único, senha inválida,
   autorização, desativação e concorrência aprovados. Testcontainers limpa
   somente seus recursos descartáveis; não remover volumes de desenvolvimento.
3. Em frontend/, executar `pnpm test`, `pnpm run lint`, `pnpm run typecheck`,
   `pnpm run build`. Esperado: tela mantém aceite/falha/reenvio nos contratos atuais.
4. Para conferência visual local, preparar DB/RSA/SUPER_ADMIN e iniciar backend
   e frontend conforme [provisionamento](admin-provisioning.md). Deixar
   BREVO_API_KEY/EMAIL_FROM vazios e ADMIN_FRONTEND_ORIGIN=http://localhost:5173.
   Entrar como SUPER_ADMIN; criar ADMIN com e-mail fictício novo: pendente e
   falha de envio recuperável, sem rede. Recarregar: conta permanece. Reenviar:
   mesma conta, FAILED, convite anterior invalidado (prova automática no passo 2).
   Login pendente falha. Desativar apenas a conta local criada para encerrar o
   cenário; usar novo endereço fictício em nova rodada. Não apagar volumes.

Não há switch para enviar pela aplicação em servidor HTTP arbitrário. A prova
local de aceite/ativação usa testes controlados, sem ferramenta SMTP ou chave real.

## Roteiro dependente de produção — pendente do mantenedor

Pré-condições: publicação revisada autorizada, conta transacional liberada,
remetente verificado, chave REST válida, tracking homologado, origem Vercel,
SUPER_ADMIN legítimo e caixa de teste sob controle/autorização do mantenedor.
Não usar contas ou endereços de terceiros.

1. Entrar como SUPER_ADMIN na origem Vercel; criar ADMIN de teste autorizado.
   Esperado: HTTP 201, pendência e ACCEPTED. Registrar separadamente aceite e
   recebimento; se FAILED, investigar configuração/quota/rede no painel privado.
2. Conferir caixa de entrada e spam: remetente efetivo, Alô Cidade, texto em
   português, 24h e URL Vercel completa. Esperado: recebimento real, sem tracking
   que exponha link sensível. Não publicar mensagem, token, senha ou link válido.
3. Abrir link; esperado: rota Vercel carrega, fragmento sai da URL e abrir não
   ativa. Informar senha forte; esperado: ativação sem login automático.
   Entrar normalmente; esperado: sessão ADMIN. Reusar convite: erro.
4. Criar segunda conta pendente de teste autorizado; guardar convite antigo
   privadamente e reenviar. Esperado: 200/ACCEPTED; link antigo inválido, novo
   ativa. Não esperar 24h nem encurtar produção; a fronteira é teste de Clock local.
5. Desativar somente os ADMINs criados neste roteiro. Esperado: sessões perdem
   acesso, contas/histórico permanecem. Para repetir, usar novos endereços de
   teste autorizados; não resetar contas reais ou manipular banco compartilhado.

Simular chave inválida, 429, falha de rede e timeout somente nos testes locais ou
ambiente isolado. Nunca interromper o serviço compartilhado para provocar falha.
Registrar na MR resultados sanitizados com versão/ambiente e observação de spam;
configuração, health ou ACCEPTED isolado não comprovam entrega. Conta bloqueada,
reescrita/tracking não resolvidos e recebimento ausente ficam pendentes.

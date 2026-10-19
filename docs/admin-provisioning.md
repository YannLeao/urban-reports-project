# Provisionamento administrativo e revisão local

## Contas e acesso

V8 amplia a mesma `identity/UserAccount` para USER, ADMIN e SUPER_ADMIN e
acrescenta status. USERs existentes continuam ACTIVE, com credenciais intactas.
ADMIN nasce PENDING_ACTIVATION, sem hash de senha, pode tornar-se ACTIVE por
convite e depois DISABLED. Não há promoção de USER, reativação, exclusão, troca
de e-mail ou gestão de outros SUPER_ADMINs. Nome usa o campo obrigatório do
modelo existente (2–100 pontos de código), sem identidade pessoal inventada.
E-mail segue RegistrationValidation.canonicalEmail e a constraint única existente.

Somente SUPER_ADMIN ativo com sessão revogável válida lista/cria/reenvia/desativa.
Somente ADMIN ativo modera: não existe hierarquia que conceda moderação a
SUPER_ADMIN. Cadastro público continua USER e agora recusa propriedades role,
status, active, activity e enabled com 400 INVALID_REQUEST. Outros campos extras
continuam ignorados conforme o contrato anterior. Criação de relatos é exclusiva
USER tanto na cadeia HTTP como no serviço.

Login recusa pendente/desativado com o mesmo erro de credencial inválida. JWT
continua sem claim de papel: cada autenticação consulta a conta atual e exige
ACTIVE. Desativação revoga todas as sessões e convites na mesma transação. /me
retorna os papéis legítimos; conta inelegível recebe 401. Trocar hash não altera
status: recuperação futura deve também recusar ADMIN não ativo, nunca reativá-lo.

## API

Todas as respostas são no-store. Erros usam ApiErrorResponse. Escritas exigem
JSON estrito com corpo de até 8192 bytes, inclusive campos desconhecidos; valores
não são coercidos. Campos extras nos comandos administrativos são recusados.

| Método e rota | Contrato |
| --- | --- |
| GET `/api/super-admin/admins?page=0&size=20` | SUPER_ADMIN; items/page/size/totalItems/totalPages; createdAt ASC/id ASC; size 1–50 |
| POST `/api/super-admin/admins` | SUPER_ADMIN; `{name,email}`; 201 `{admin,mailStatus}` |
| POST `/api/super-admin/admins/{id}/activation-resends` | SUPER_ADMIN; `{}`; 200 `{admin,mailStatus}`; somente pendente |
| POST `/api/super-admin/admins/{id}/deactivation` | SUPER_ADMIN; `{}`; 200 admin; idempotente para desativado |
| POST `/api/auth/admin-activations` | Público; `{token,password}`; 200 `{activated:true}`; sem sessão automática |

Admin contém id/name/email/status/createdAt. Nenhuma resposta da gestão contém
token, link, hash ou senha. mailStatus ACCEPTED significa aceite da API Brevo, sem
prova de recebimento; FAILED significa conta pendente persistida e falha no
pedido de envio. A lista não inventa status de entrega. Token inválido, vencido,
usado ou revogado recebe 400 INVALID_ACTIVATION_LINK. Senha inválida em convite
válido recebe 400 INVALID_PASSWORD sem consumir convite. Identidade inválida:
400 INVALID_IDENTITY; paginação inválida: 400 INVALID_PAGE; e-mail ocupado:
409 EMAIL_ALREADY_REGISTERED; reenvio fora de pendente: 409 ADMIN_NOT_PENDING;
ID que não identifica ADMIN: 404 ADMIN_NOT_FOUND. Falhas de persistência: 503
ADMINISTRATION_UNAVAILABLE. 401/403 seguem autenticação/autorização existentes.

## Convite, envio e concorrência

Token aleatório com 256 bits, base64url sem padding, específico de ativação
administrativa. Só SHA-256 é persistido em admin_activation_tokens. Expira em
24 horas pelo Clock; igualdade ao vencimento já é expiração. Abrir o link não
consome: somente o POST valida senha, consome convite e ativa na mesma transação.
Senha usa o PasswordPolicy compartilhado do cadastro e Argon2id central.

ADMIN_FRONTEND_ORIGIN deve ser origem absoluta sem barra final, path, query,
fragmento ou credenciais. Exige HTTPS; HTTP é permitido apenas para localhost
ou 127.0.0.1. Não usa Host/headers da requisição. Link:
`<origem>/ativar-administrador#token=<segredo>`. A página captura o fragmento em
memória, remove-o da URL, não usa storage/query cache e não faz GET de validação.
A aplicação define Referrer-Policy no-referrer por meta e usa recursos locais.
Após ativar, limpa token/senha e orienta login normal. Recarregar após remoção
do fragmento exige abrir novamente o convite original, enquanto válido.

Conta/convite confirmam antes do envio HTTPS. Falha de envio não apaga conta e pode ser
recuperada por reenvio. Não há transação distribuída nem fila de e-mail. Uma
resposta perdida também pode significar envio aceito; a UI orienta consultar a
lista antes de repetir criação. Reenvio serializa pela conta, invalida convites
anteriores e gera um novo. Mensagens podem chegar fora de ordem; apenas o último
token confirmado permanece utilizável, ainda que outro e-mail chegue depois.
Desativação concorrente pode permitir envio de mensagem já preparado, mas seu
link fica inválido. Não expor o token como alternativa manual ao SUPER_ADMIN.

Mutações travam contas envolvidas em ordem lexicográfica de UUID (igual à ordem
PostgreSQL); ativação trava conta antes de token. Moderação trava conta do ADMIN
antes de ocorrência e revalida sessão/papel/status sob lock. Esse é o instante
de autorização: desativação anterior impede ação; uma operação já autorizada
pode confirmar antes da desativação que aguardava seu lock. Depois do commit de
desativação, novas ações são negadas. Sem cancelamento retroativo prometido.
A moderação não trava journal, preservando a ordem do ADR 0014. Recuperação de
senha futura segue conta → token → sessões e não altera status.

## Bootstrap explícito

O modo abaixo cria o primeiro SUPER_ADMIN somente se não houver nenhum.
Exige nome, e-mail novo e senha forte digitados no console; senha não aparece
na tela, argumento CLI, arquivo de configuração ou log. Um lock de linha de
guarda e índice único parcial garantem exclusão mútua, inclusive em processos
concorrentes. Repetir recusa a operação, sem redefinir senha ou promover conta.
Não há endpoint, seed ou execução automática no boot normal. O flag explícito
abre aplicação sem servidor HTTP e a encerra ao terminar. Sem console protegido,
o comando falha; não existe fallback para argumento de senha ou pipe de texto.

Em backend/, com Java 21 e banco/chaves/configuração normais:

```bash
export JAVA_HOME="$HOME/.jdks/ms-21.0.12.1"
./mvnw package -DskipTests
"$JAVA_HOME/bin/java" -jar target/urban-reports-0.0.1-SNAPSHOT.jar --admin.bootstrap=true
```

Ajuste JAVA_HOME ao JDK 21 instalado. Execute em terminal interativo real.
O backend importa opcionalmente `.env` do diretório de trabalho. Em hospedagem
Render, operador autorizado pode executar no Shell interativo do serviço:

```bash
java -jar /app/app.jar --admin.bootstrap=true
```

Usa a mesma imagem, banco e Secret Files RSA configurados no serviço. Não rode
sem intenção de provisionar esse ambiente. Se o plano não disponibilizar Shell
interativo, use uma sessão operacional autorizada da mesma imagem/configuração
com TTY e acesso ao banco; não publique endpoint nem passe senha por variáveis
ou argumentos para contornar a falta de console. Esta documentação não comprova
execução remota e esta tarefa não provisiona conta real de produção.

## Revisão local e homologação

Preparação, variáveis e roteiro local/produção estão no
[guia de e-mail transacional](transactional-email.md). O transporte SMTP/Mailpit
foi substituído por Brevo HTTPS; não há fallback. O backend inicia sem chave ou
remetente, mas a tentativa retorna FAILED mantendo a conta pendente. Para
executar sem serviços externos, os testes usam HTTP local controlado e
PostgreSQL descartável; o endpoint de produção não é configurável.

Para revisar a UI local, iniciar o banco conforme README, configurar DB_* e
AUTH_JWT_* conforme [segurança](security.md), criar SUPER_ADMIN com o comando
interativo acima e iniciar backend/frontend conforme os respectivos guias.
Sem credenciais Brevo, testar criação, persistência e reenvio FAILED na tela.
Ativação, uso único, expiração e concorrência são exercitados automaticamente
com Clock controlável, sem esperar 24h ou encurtar o prazo em produção.

Continuam pertinentes as verificações de moderação: USER registra relato;
ADMIN ativo analisa, resolve ou rejeita com justificativa; autor vê histórico e
notificação interna. SUPER_ADMIN desativa ADMIN e a sessão anterior perde acesso;
histórico permanece. USER/ADMIN não provisionam e SUPER_ADMIN não herda moderação.

## Compatibilidade e limites

Publicar frontend que aceita os três papéis antes de emitir novas identidades;
coordenar V8 após V7 e integrar backend. Não executar bootstrap ou deploy como
rotina de testes. A moderação grava uma notificação interna por transição válida;
a central do cidadão expõe somente as notificações da própria conta.
Enviar convites HTTPS é independente dessa central. Testes usam PostgreSQL real,
JWTs reais, Clock controlável e captura/falha de e-mail; o servidor HTTP local
verifica o adaptador. Não equivalem a prova de entrega externa ou deploy.

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
token, link, hash ou senha. mailStatus ACCEPTED significa aceite SMTP, sem
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

Conta/convite confirmam antes do SMTP. Falha de envio não apaga conta e pode ser
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

## Subir para revisão local

1. Na raiz, iniciar o PostgreSQL existente, sem excluir volumes:

   ```bash
   docker compose up -d db
   ```

2. Para capturar convites locais sem serviço externo, executar Mailpit separado
   do Compose de três serviços, somente em loopback:

   ```bash
   docker run --name piec4-mailpit --rm -d \
     -p 127.0.0.1:1025:1025 -p 127.0.0.1:8025:8025 axllent/mailpit:v1.31.5
   ```

   Se o container já existir, reutilize sua instância em vez de criar outra.
   A imagem e as portas seguem a [documentação oficial do Mailpit](https://mailpit.axllent.org/docs/install/docker/).
   SMTP local sem autenticação serve apenas à captura de teste. A interface
   http://localhost:8025 permite ler o convite e clicar no link, sem consultar
   o banco ou logs. Não exportar mensagens contendo links de ativação para MR.

3. Em `backend/.env` local (não versionar), preencher DB_* compatível com o
   Compose e as cinco AUTH_JWT_* obrigatórias conforme [segurança](security.md).
   Acrescentar:

   ```properties
   ADMIN_FRONTEND_ORIGIN=http://localhost:5173
   ADMIN_MAIL_FROM=convites@example.com
   SMTP_HOST=localhost
   SMTP_PORT=1025
   SMTP_AUTH=false
   SMTP_STARTTLS=false
   FRONTEND_ALLOWED_ORIGINS=http://localhost:5173
   ```

   SMTP_USERNAME/SMTP_PASSWORD podem ficar vazios no Mailpit. Para produção,
   usar host/porta/usuário/senha reais como configuração protegida, AUTH=true e
   STARTTLS=true. Não há credenciais nos exemplos nem envio por console.
   Boot sem SMTP configurado continua possível; convites retornam FAILED.
   R2 é necessário para registrar e visualizar fotos reais no fluxo completo;
   seguir [storage](image-storage.md), sem usar placeholders como credenciais.

4. Criar o primeiro SUPER_ADMIN pelo comando acima, se ainda não houver um.
   Depois, em terminais separados:

   ```bash
   cd backend
   export JAVA_HOME="$HOME/.jdks/ms-21.0.12.1"
   ./mvnw spring-boot:run -Dspring-boot.run.profiles=dev
   ```

   ```bash
   cd frontend
   # Ative Node 22.23.2 e pnpm 10.34.5 conforme frontend-development.md.
   pnpm install --frozen-lockfile
   VITE_API_URL=http://localhost:8080 pnpm run dev
   ```

   Se usar o backend containerizado, SMTP_HOST deve ser um host alcançável por
   ele; localhost é o próprio container. O Compose transmite as variáveis
   SMTP_* e ADMIN_*, interpoladas do shell/.env da raiz/--env-file, sem carregar
   automaticamente backend/.env. Ajustar a origem canônica ao navegador usado.

## Roteiro de revisão

1. Em http://localhost:5173/entrar, autenticar SUPER_ADMIN. Abrir
   `/administracao/contas`, criar ADMIN com nome/e-mail novo e verificar pendência.
2. Tentar e-mail de USER previamente cadastrado: conflito, sem promoção.
   Tentar login de ADMIN pendente: credencial inválida.
3. Abrir convite no Mailpit. Conferir fragmento removido e nenhuma ativação só
   por abrir. Definir senha/confirmar, entrar normalmente. Reutilizar link: erro.
4. Criar outra conta pendente, reenviar, abrir convite antigo: erro; novo: válido.
   Parar Mailpit em ambiente local, criar outra conta e conferir FAILED e opção
   de reenvio; retomar o servidor e reenviar sem duplicar conta.
5. Com USER, cadastrar relatos com foto. Em outro navegador, entrar ADMIN e abrir
   `/administracao/relatos`. Iniciar análise, resolver outro já em análise e
   rejeitar com justificativa. Conferir histórico com nome do moderador.
6. Como autor, consultar `/meus-relatos/{id}`: histórico funcional “Moderação”,
   justificativa, sem editar/excluir após análise. Rejeitado fica fora da lista;
   detalhe e imagem públicos retornam 404, permanecendo no acesso privado do autor.
7. Deixar a sessão ADMIN aberta. Como SUPER_ADMIN, desativar essa conta com
   confirmação. Nova consulta/ação do ADMIN recebe 401 e encerra a sessão local;
   novo login falha. Histórico anterior continua íntegro. Repetir desativação
   por API é idempotente, sem reativação nem novos eventos.
8. SUPER_ADMIN não acessa moderação; ADMIN e USER não provisionam. Anônimo deve
   entrar. Verificar recarregamento de rotas, teclado, foco, 360 px e zoom 200%.

## Compatibilidade e limites

Publicar frontend que aceita os três papéis antes de emitir novas identidades;
coordenar V8 após V7 e integrar backend. Não executar bootstrap ou deploy como
rotina de testes. A moderação grava uma notificação interna por transição válida;
a central do cidadão expõe somente as notificações da própria conta.
Enviar convites SMTP é independente dessa central. Testes usam PostgreSQL real,
JWTs reais, Clock controlável e captura/falha de e-mail; a sonda SMTP local
verifica o adaptador. Não equivalem a prova de entrega externa ou deploy.

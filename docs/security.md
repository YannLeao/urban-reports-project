# Base de segurança da API

A API usa Spring Boot 4.1.1 e Spring Security 7.1.1, gerenciado pelo Boot.
Esta base implementa autorização explícita e hash de senha; ainda não implementa
login, validação JWT ou logout. O [cadastro público](identity.md) persiste contas
sem autenticar. Não há usuário padrão gerado pelo Boot,
HTTP Basic, form login, remember-me, logout padrão ou cache de redirecionamento.

## Acesso HTTP

| Requisição | Política / resposta |
| --- | --- |
| POST `/api/auth/register` | Público, JSON, sem CSRF; 201/400/409/415/500 conforme contrato de identidade |
| GET/HEAD `/api/health` | Público; 200, GET mantém `{"status":"UP"}` |
| GET/HEAD `/swagger`, `/swagger-ui.html`, `/swagger-ui/**`, `/webjars/swagger-ui/**`, `/v3/api-docs`, `/v3/api-docs.yaml`, `/v3/api-docs/swagger-config` | Passam pela segurança; configuração springdoc determina disponibilidade |
| Swagger em `dev` | Atalho `/swagger` redireciona à UI; especificação e assets disponíveis |
| Swagger sem perfil ou em `prod` | 404, incluindo assets; alias inexistentes continuam 404 também em dev |
| GET `/api/storage/images` ou `/api/storage/images/{id}` | 401 sem identidade; 403 com identidade simulada de teste |
| POST `/api/storage/images` | 403 sem CSRF válido; com CSRF válido, 401 sem identidade ou 403 com identidade simulada |
| Demais requisições | `denyAll`, inclusive Actuator, futuros endpoints e `/error` direto |
| Preflight válido de origem permitida | CORS processado antes de CSRF/autorização |
| Dispatch interno `ERROR` | Preserva o processamento de erro do framework e o status original |

O health do Render usa `/api/health`; o Compose verifica a porta TCP do backend.
Não há motivo operacional para liberar `/actuator/**`. Somente o namespace de
WebJars do Swagger é permitido, nunca todos os WebJars. A lista de documentação
acompanha springdoc 3.1.0 / Swagger UI 5.32.11 e deve ser revisada em upgrades.
Não existe bypass em `dev` para o storage. A prova frontend `/prova-imagem`
continua local, sem upload. O contrato autorizado de imagens pertence à #36.

## CORS e configuração

`FRONTEND_ALLOWED_ORIGINS` continua sendo a única fonte de origens, separadas por
vírgula; o padrão local é `http://localhost:5173`. No Render, preserve a origem
canônica **exata** da Vercel e as origens locais autorizadas. Não use `*`, padrões
`*.vercel.app` ou reflexão irrestrita. A configuração recusa wildcard no startup.

Um único `CorsConfigurationSource` integra CORS à cadeia Security, substituindo
o mapeamento MVC. Métodos: GET, HEAD, POST, PUT, PATCH, DELETE e OPTIONS (HEAD
acompanha o health); cabeçalhos: Content-Type e Authorization. Não há
`allowCredentials`, cookies de autenticação ou `credentials: include` no frontend.
Authorization permitido no preflight não ativa JWT. Bearer arbitrário é ignorado
como identidade e não concede acesso. CORS não é autenticação.

Origens permitidas recebem `Access-Control-Allow-Origin` também em 401/403.
Origens rejeitadas não recebem autorização de leitura; o processador CORS padrão
pode responder 403 em texto, fora do envelope JSON dos handlers de segurança.
As variáveis DB/R2 e os perfis permanecem iguais; não há segredo JWT a configurar.

## CSRF transitório e sessão

CSRF permanece habilitado com o mecanismo padrão do Spring. Requisições mutáveis
sem token válido podem receber 403 antes da regra de autorização. Não se altera
a ordem dos filtros para forçar 401. Não há endpoint de token CSRF. Somente
POST `/api/auth/register` é exceção:
cria conta sem autoridade de cookies/sessão, aceita estritamente JSON (8 KiB),
não autentica nem altera conta existente. Form/text/plain/multipart recebem 415.
O frontend envia com credentials omit e o cadastro não cria sessão.

O contexto de segurança usa `RequestAttributeSecurityContextRepository`: não lê
nem persiste autenticação em sessão HTTP. O repositório padrão de CSRF pode usar
sessão; isso não representa login nem justifica impor `STATELESS` nesta etapa.
Não existe mecanismo real que produza identidade autenticada nesta entrega.

A exceção de cadastro não abrange login, reset, logout ou outras operações.
Antes de #35, fechar transporte JWT/cookies e revisar CSRF em conjunto.
CORS não impede automação por clientes não navegador.

## Senhas

O bean central `PasswordEncoder` usa `Argon2PasswordEncoder` com Argon2id:
19.456 KiB (19 MiB), 2 iterações, paralelismo 1, salt aleatório de 16 bytes e hash
de 32 bytes. O formato `$argon2id$v=19$m=19456,t=2,p=1$...` inclui parâmetros e
salt; não há prefixo de DelegatingPasswordEncoder nem fallback para texto puro.
O encoder não normaliza, remove espaços nem trunca a senha.

`bcprov-jdk18on` 1.86 fornece Bouncy Castle para o encoder; sua versão é explícita
no POM porque o BOM do Boot 4.1.1 não a gerencia. A política de 15–128 pontos de código,
confirmação local e validação está em [identidade](identity.md). Não registrar senhas ou hashes reais.
Aferir encode/matches sob os recursos e concorrência do Render antes do fluxo
real; medições locais são referências, nunca limiares frágeis de CI.

## Erros e testes

Os handlers `AuthenticationEntryPoint` e `AccessDeniedHandler` escrevem JSON com
`timestamp`, `status`, `error`, `message`, `path`, reutilizando o DTO em `api/`.
Mensagens: `Authentication is required` (401), `Access is denied` (403) e
`Invalid CSRF token` (403). Não há redirect de login, challenge Basic, stack trace
ou dados da requisição além do caminho. O advice do storage continua restrito ao
controller de imagens. Cadastro tem advice próprio e acrescenta code/fieldErrors
opcionais; os campos são omitidos nas respostas antigas.

Execute em `backend/`, com JDK 21 e Docker disponível:

```bash
./mvnw verify
```

`SecurityIntegrationTests` usa a aplicação e cadeia reais com PostgreSQL
Testcontainers e mock de `ImageStorage`, verificando ausência de chamadas ao
provedor. Cobre matriz de acesso, CSRF, CORS, sessão ignorada, Bearer/Basic sem
login e dispatch de erro. Os testes HTTP de documentação continuam cobrindo
base, prod, dev e ativação dev via `.env` de teste. `PasswordEncoderTests`
confere formato, parâmetros, matches, senha incorreta, espaços e salt aleatório.
`ImageStorageControllerTests` desliga filtros **somente nessa camada** para
validar contrato interno controller/service com storage em memória. A política
pública do mesmo endpoint é coberta separadamente pela cadeia real.

## Próximas entregas e validação remota

- Cadastro implementado: [modelo, contrato e roteiro de publicação](identity.md).
- #35: login e JWT, transporte, armazenamento no navegador, renovação, duração,
  assinatura/chaves, sessão ativa, revogação/invalidação imediata, recuperação de
  senha, persistência após restart e identidade no frontend. JWT sozinho não
  implementa logout ou revogação.
- #36: contrato de imagens e autorização; não reabrir a prova técnica por perfil.

Após revisão e integração normais, seguir o [deploy backend](backend-deployment.md):
registrar SHA, pipeline/deployment, health 200, Swagger 404, GET técnico 401 e
`/status` na Vercel sem erro CORS. Não fazer upload real para provar bloqueio.
Evidências datadas e medições locais pertencem à MR/issue, não comprovam deploy.

## Referências

- [CORS no Spring Security 7.1](https://docs.spring.io/spring-security/reference/7.1/servlet/integrations/cors.html)
- [CSRF no Spring Security 7.1](https://docs.spring.io/spring-security/reference/7.1/servlet/exploits/csrf.html)
- [Password storage no Spring Security](https://docs.spring.io/spring-security/reference/features/authentication/password-storage.html)
- [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [Bouncy Castle para Java](https://www.bouncycastle.org/download/bouncy-castle-java/)

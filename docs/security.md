# Segurança da API e sessões

Spring Boot 4.1.1 / Spring Security 7.1.1 implementam autenticação pelo Resource
Server/Jose com JWT RS256 e sessões PostgreSQL. O [ADR 0011](adr/0011-adotar-sessoes-jwt-revogaveis.md)
evolui a base dos ADRs 0009/0010. Argon2id central mantém 19 MiB, 2 iterações,
paralelismo 1, salt 16 bytes e hash 32 bytes, sem normalizar senhas.

## Acesso HTTP

| Requisição | Política |
| --- | --- |
| POST `/api/auth/register` | Público, JSON; contrato em [identidade](identity.md) |
| POST `/api/auth/login` | Público, JSON; 200/400/401/415/503 |
| GET `/api/auth/me` | Sessão válida; 200 com id/name/email/role atuais |
| POST `/api/auth/logout` | Sessão válida e Content-Type application/json; 204 após commit |
| GET/HEAD `/api/health` | Público |
| GET/HEAD caminhos Swagger já existentes | Disponíveis somente com dev explícito; base/prod retornam 404 |
| Storage técnico, Actuator, demais caminhos e `/error` direto | denyAll; 401 anônimo, 403 autenticado |
| Dispatch interno ERROR | Preserva processamento/status original |

Login recebe apenas email/password (8 KiB no máximo), normaliza o e-mail pela
mesma regra do cadastro e usa matches na senha exata, limitada a 256 unidades
UTF-16 sem aplicar mínimo de cadastro. Campos inválidos retornam 400 INVALID_REQUEST.
Campos extras no login são rejeitados. Conta inexistente e senha incorreta têm o
mesmo 401 INVALID_CREDENTIALS; a primeira executa matches contra hash sintético
pré-calculado no startup, sem prometer tempo idêntico. Falha não cria sessão.
Não há token na resposta antes de o commit concluir.

200 login: `{accessToken, tokenType: "Bearer", expiresAt, user: {id,name,email,role}}`.
expiresAt é ISO-8601 UTC. Respostas de auth e handlers de segurança têm no-store;
não retornam entidades, senha ou hash. Erros preservam timestamp/status/error/
message/path e code quando aplicável, sem redirect/HTML. 401 tem WWW-Authenticate:
Bearer. Indisponibilidade de persistência em autenticação resulta em 503.

## Validação e revogação

JWT exige iss/aud/sub/jti/iat/exp; sub e jti são UUIDs canônicos. Verifica assinatura,
RS256 exclusivo, kid conhecido, issuer/audience e validade de exatamente 1800
segundos. Clock é injetável, com **zero tolerância temporal**. Sessão deve existir,
pertencer ao sub, estar não revogada e não expirada; iat/exp correspondem aos
instantes persistidos. Conta deve existir e fornece o papel atual. Não há role
claim, cache de sessão, sid redundante, Redis ou refresh token.

V3 cria auth_sessions com FK de conta, timestamps, CHECK de validade e índice
user_id. Não armazena token bruto, IP, user agent ou fingerprint. Sessões expiradas
ou revogadas permanecem: retenção/limpeza são trabalho futuro, não pré-requisito
para invalidar. Logins coexistem sem limite arbitrário de dispositivos.

Logout usa somente a identidade autenticada e revoga a sessão corrente. Reuso
após commit retorna 401, inclusive logout repetido. Requisições autenticadas antes
do commit não são canceladas retroativamente. Abas copiadas compartilham a mesma
credencial, portanto serão recusadas na próxima chamada; outros logins não mudam.

## Chaves externas

Obrigatórias em todos os perfis; ausência/invalidez impede startup:

| Variável | Contrato |
| --- | --- |
| AUTH_JWT_ISSUER | Identificador exato do emissor, por exemplo https://api.example.com |
| AUTH_JWT_AUDIENCE | Identificador exato desta API, por exemplo urban-reports-api |
| AUTH_JWT_KEY_ID | Identificador público não vazio do par ativo |
| AUTH_JWT_PRIVATE_KEY_FILE | Caminho absoluto do PEM RSA PKCS8 privado |
| AUTH_JWT_PUBLIC_KEY_FILE | Caminho absoluto do PEM X509 público |

Duração fixa em código: 30 minutos. Não há chave padrão, geração em produção ou
chave no bundle. Startup confere parsing, tamanho e correspondência do par.
Guardar arquivos fora do repositório/contexto Docker; montar somente em runtime.
Um único par/kid ativo: troca invalida tokens antigos, sem rotação transparente.
Mesmas chaves, issuer/audience/kid e banco preservam sessões após restart. Nunca
buscar jku/x5u do cliente ou registrar Authorization/JWT/chave privada.

Geração local (não imprime chave; diretório fora do checkout):

```bash
umask 077
mkdir -p "$HOME/.config/urban-reports/keys"
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 \
  -out "$HOME/.config/urban-reports/keys/private.pem"
openssl pkey -in "$HOME/.config/urban-reports/keys/private.pem" -pubout \
  -out "$HOME/.config/urban-reports/keys/public.pem"
```

Defina os caminhos absolutos em backend/.env, sem copiar o conteúdo das chaves.
As exclusões *.pem/*.key no contexto backend são defesa adicional.
No Render, use Secret Files e caminhos montados; veja [deploy](backend-deployment.md).

## CORS, CSRF e navegador

Uma única fonte CORS na cadeia usa FRONTEND_ALLOWED_ORIGINS com origens exatas,
sem wildcard e sem credentials. Permite Authorization/Content-Type e métodos
GET/HEAD/POST/PUT/PATCH/DELETE/OPTIONS. Preflight precede autenticação. Erros de
origem permitida preservam CORS; origem rejeitada pode receber texto 403 do
framework, sem autorização de leitura.

Bearer somente por header explícito, nunca query/form/cookie. Cadeia servlet
STATELESS, sem JSESSIONID/Basic/form/remember-me/request cache. Não há outro fluxo
de cookies: CSRF está desabilitado nessa cadeia porque o navegador não anexa a
credencial automaticamente. POST de auth aceita JSON, sem method override.
Mudar transporte para cookies exige revisar CSRF e CORS.

SessionStorage `alo-cidade.auth.v1` guarda só token/expiração; identidade é validada
por /me antes de exibir a rota privada. Sem storage, sessão fica em memória e
reload exige login. XSS pode ler token; não equivale a HttpOnly, nem promete
limpeza ao fechar o navegador. Não inserir HTML não confiável. Login/cadastro
omitem Bearer e cookies; cliente privado limita caminho à API configurada e
recusa redirects. Nenhum token em URL, imagem externa ou cache de mutation.

401 privado/expiração encerram estado e caches privados; 403/rede não são logout.
Falha de logout preserva a credencial e permite repetir sem anunciar sucesso.
Geração do contexto impede resposta tardia de restaurar identidade ou apagar
sessão nova. Consultas futuras usam `['private', userId, ...]` e AbortSignal;
não persistir caches privados. Retorno do guard aceita apenas pathname interno
sem escapes/query/autoridade. Recuperação futura: [contrato de integração](password-recovery-integration.md).

**Não há rate limit implementado.** CORS, CSRF e Argon2 não impedem tentativas
automatizadas; não alegar proteção contra brute force. Não há bloqueio permanente
de conta. Definir limitação de tentativas e medir Argon2 sob carga no ambiente
publicado continuam necessidades operacionais.

## Validação

`./mvnw verify` usa JDK 21, Testcontainers/PostgreSQL, tokens realmente assinados,
Clock controlado, rollback e sincronização determinística da corrida login/reset.
Inclui restart da aplicação com mesmas chaves/banco, sessão ativa e revogada.
Health/Swagger continuam testados nos três perfis. Storage com filtros desligados
é apenas teste de contrato interno e não substitui cadeia real.

Frontend testa bootstrap, retorno, expiração, 401/403/rede, logout confirmado/falho,
storage indisponível e respostas tardias. Publicação e roteiro de navegador seguem
[deploy frontend](frontend-deployment.md). Testes locais não comprovam deploy.

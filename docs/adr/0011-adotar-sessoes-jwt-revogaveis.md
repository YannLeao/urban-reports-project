# ADR 0011: Adotar sessões JWT revogáveis

- Status: aceito
- Data: 2026-09-23

## Contexto

O cadastro dos ADRs 0009/0010 precisa de login real e logout imediato, inclusive
com frontend Vercel e backend Render em origens distintas. A futura recuperação
precisa invalidar credenciais anteriores de forma atômica com a troca de senha.

## Decisão

Usar Resource Server/Jose do Spring Security, RS256 e par RSA externo de pelo
menos 2048 bits. Cada login cria sessão PostgreSQL e JWT com iss/aud/sub/jti/iat/exp;
jti identifica a sessão, sub a conta. Validade absoluta de 30 minutos, sem refresh
ou extensão por atividade. Claims não carregam dados pessoais ou papel. Cada
requisição consulta sessão e conta; o papel vem do banco. Não há cache de revogação.

Transportar exclusivamente Authorization: Bearer por HTTPS em produção. Não
aceitar query, formulário ou cookie. Autenticação servlet é STATELESS, sem
Basic/form login/remember-me/request cache. Remover CSRF nesta cadeia: não existe
fluxo autenticado por credencial automaticamente anexada pelo navegador. Login,
cadastro e logout aceitam JSON. Essa decisão substitui a política transitória de
CSRF dos ADRs 0009/0010; introduzir cookies exige nova revisão. CORS permanece
com origens exatas e sem credentials. Rotas não autorizadas seguem denyAll.

Guardar somente token e expiração em sessionStorage versionado. React não insere
HTML não confiável. SessionStorage é acessível a JavaScript: XSS pode roubar o
JWT, não equivale a HttpOnly. Navegadores podem restaurar ou copiar abas; não
prometemos apagar credenciais ao fechar. Storage indisponível usa memória.

Logout revoga só a sessão corrente e confirma após commit; falha de rede mantém
a credencial para repetir. Troca de senha futura deve travar a conta, trocar hash
e revogar todas as sessões na mesma transação. Login verifica Argon2 fora do lock
e compara hash novamente sob o mesmo lock antes de persistir a sessão.

## Consequências

Banco indisponível nega acesso com 503, nunca valida somente a assinatura. A
aplicação não é inteiramente stateless. Requisições já autenticadas antes de um
commit de revogação podem terminar. Cópias da mesma sessão em outras abas são
recusadas na próxima chamada; logins independentes continuam válidos.

Chaves/banco preservados permitem restart sem perder sessões. Só há um kid ativo;
substituir o par invalida tokens antigos, sem rotação transparente. Não há busca
remota de chaves controlada por jku/x5u. Sessões inativas permanecem nesta sprint;
uma política futura deve definir retenção/limpeza. Não introduzir Redis.

Não há rate limit implementado: CORS/CSRF/Argon2 não impedem brute force.
Recuperação/e-mail e ocorrências continuam fora desta entrega.

Contratos: [segurança](../security.md), [integração de recuperação](../password-recovery-integration.md).
Referências: [Spring Resource Server](https://docs.spring.io/spring-security/reference/servlet/oauth2/resource-server/jwt.html),
[OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).

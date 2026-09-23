# ADR 0010: Estabelecer cadastro público de cidadão

- Status: aceito
- Data: 2026-09-23

## Contexto

A base de segurança do ADR 0009 oferece encoder e negação por padrão, mas não
persiste contas. O cadastro precisa funcionar antes da definição completa de
login/JWT e reutilizar a identidade visual existente.

## Decisão

Persistir uma única UserAccount em PostgreSQL/Flyway, com UUID gerado pelo
servidor, e-mail ASCII canônico único, hash pelo encoder Argon2id central,
USER e instantes UTC. Normalizar trim externo ASCII e lowercase Locale.ROOT
no e-mail, sem regras de provedor. Preservar a senha de 15–128 pontos de código.
Os detalhes e limites estão em [identity.md](../identity.md).

Liberar somente POST /api/auth/register e excluir exatamente esse método/caminho
da exigência de CSRF. O handler aceita estritamente JSON e limita corpo a 8 KiB;
form, multipart e text/plain recebem 415. Não há method override habilitado.
O fluxo cria conta nova sem usar autoridade de sessão/cookies, sem alterar
conta existente e sem login automático. Manter CORS com allowlist exata e sem
credentials; frontend omite cookies/Authorization. CSRF continua ativo no resto.
Esta exceção não decide a política de login, reset, logout ou ações autenticadas.

Retornar 201 mínimo e 409 explícito para e-mail duplicado. A constraint nomeada
é a autoridade inclusive sob concorrência. Acrescentar códigos opcionais ao
envelope existente; não expor valores de entrada, hash ou detalhes SQL.
Campos JSON extras são ignorados só no DTO de cadastro; papel e UUID são
sempre definidos no servidor.

Frontend usa chamada direta sem cache/retry e limpa senhas após HTTP.
Sucesso confirma persistência sem alegar sessão ou verificação de e-mail;
falha de rede comunica incerteza sobre o resultado.

## Consequências

409 permite inferir existência de conta: aceitamos esse compromisso para
orientar correção no cadastro. Não criar endpoint de disponibilidade; login e
recuperação terão mensagens genéricas segundo seus requisitos. CORS não bloqueia
clientes não navegador ou automação; não representa proteção contra abuso.
Senha longa e hash não substituem política futura de senhas comprometidas.

O cadastro não depende de JWT. Transporte/armazenamento, assinatura, expiração,
renovação e revogação persistida permanecem decisões da #35. Novos papéis exigem
nova migration e requisito próprio. Não há envio de e-mail nem identidade
simulada fora dos testes. Esta decisão evolui a fase transitória do ADR 0009.

Referências: [Spring Security CSRF](https://docs.spring.io/spring-security/reference/servlet/exploits/csrf.html)
e [OWASP Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html).

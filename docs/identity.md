# Identidade e cadastro de cidadão

## Modelo compartilhado

`identity/UserAccount` é a conta a reutilizar em login e recuperação. A migration
`V2__create_user_accounts.sql` cria `user_accounts`: UUID do servidor, nome,
e-mail canônico UNIQUE (`uk_user_accounts_email`), hash Argon2id VARCHAR(512),
papel textual USER e created_at/updated_at em timestamptz (Instant/UTC).
O CHECK de e-mail exige ASCII imprimível sem espaços e lowercase; o CHECK de
papel aceita USER. Hibernate permanece em validate. Futuras alterações de
papéis exigem requisito e nova migration, sem uma segunda entidade de usuário.
Não há seed, status de conta, verificação de e-mail ou tabela de tokens.

## Validação e normalização

Backend (`RegistrationValidation`) e frontend (`registrationSchema`) compartilham
um contrato explícito, com exemplos equivalentes nos testes:

- Trim externo remove somente whitespace ASCII U+0009–U+000D e U+0020.
  Nome tem 2–100 pontos de código após trim, preserva caixa, acentos, espaços
  internos, apóstrofos e hífens. Rejeita controles U+0000–001F/U+007F–009F,
  separadores U+2028/U+2029 e UTF-16 inválido. É texto, nunca HTML.
- E-mail aceita ASCII, até 254 caracteres, local-part de até 64 caracteres,
  átomos separados por pontos (sem pontos consecutivos/nas extremidades) e
  domínio com pelo menos um ponto. Labels têm até 63 caracteres, letras,
  dígitos e hífens internos. Não aceita local-part entre aspas, literal IP,
  domínio sem ponto ou endereço internacional nesta versão. Isso define o
  subconjunto sintático do produto; não prova existência da caixa.
- `canonicalEmail` aplica o mesmo trim e lowercase com Locale.ROOT. Essa regra
  case-insensitive é do produto, não uma afirmação sobre todo servidor de
  e-mail. Não remove pontos nem `+tag`; login e recuperação devem reutilizá-la.
- Senha tem 15–128 pontos de código Unicode, incluindo espaços e caracteres
  fora do BMP. Sem trim, case folding, normalização, mistura obrigatória ou
  truncamento. UTF-16 inválido é rejeitado. O comprimento não é um medidor de
  força nem checagem de senhas comprometidas. O encoder central da segurança
  gera Argon2id; nenhuma credencial é registrada em logs da aplicação.
- Confirmação pertence somente ao formulário, não à API nem à persistência.

Exemplos aceitos: `USER+tag@EXAMPLE.COM` → `user+tag@example.com`,
`a.b@example.co.uk` e `o'hara@example.com`. Rejeitados: `a..b@example.com`,
`a@localhost`, `á@example.com`, `a@-example.com`, `a@exa_mple.com`.
O input HTML de e-mail também pode remover whitespace externo nativamente.

## API pública

`POST /api/auth/register`, estritamente `Content-Type: application/json`.
Corpo limitado a **8192 bytes**, inclusive transferência chunked e propriedades
ignoradas. Valores de nome/e-mail/senha devem ser strings; tipos coercíveis,
JSON malformado, múltiplos documentos e corpo excessivo recebem 400. A leitura
limitada acontece antes da desserialização e do hash, sem mudar Jackson global.

```json
{"name":"Pessoa Exemplo","email":"pessoa@example.com","password":"uma frase de teste longa"}
```

201 retorna somente `id`, `name`, `email`, `role: "USER"`. Não há Location
para recurso inexistente, token, cookie de sessão, login automático ou envio de
e-mail. Campos extras são ignorados neste DTO; id, role e password_hash do
cliente nunca determinam a conta. Respostas do cadastro usam Cache-Control:
no-store. O controller tem advice próprio; storage mantém seu contrato.

O envelope compartilhado preserva timestamp, status, error, message e path.
Acrescenta campos opcionais code e fieldErrors (campo → lista de códigos),
omitidos das respostas anteriores. Não inclui valores rejeitados ou exceções.
Clientes devem usar os códigos, não a mensagem em inglês, para apresentação.

| HTTP | code | fieldErrors |
| --- | --- | --- |
| 400 | VALIDATION_ERROR | name: INVALID_NAME; email: INVALID_EMAIL; password: INVALID_PASSWORD |
| 400 | INVALID_REQUEST | ausente |
| 409 | EMAIL_ALREADY_REGISTERED | ausente; UI associa ao e-mail |
| 415 | UNSUPPORTED_MEDIA_TYPE | ausente |
| 500 | INTERNAL_ERROR | ausente |

O serviço valida, calcula hash, define UUID/USER/instantes e salva com flush em
transação. O advice trata falhas após rollback/commit: somente SQLSTATE 23505
com constraint `uk_user_accounts_email` vira 409. A constraint é a autoridade,
sem consulta de disponibilidade. Concorrência gera um 201 e um 409, uma linha.
CORS rejeitado e outras recusas da cadeia seguem [segurança](security.md),
inclusive respostas fora deste envelope quando geradas pelo framework.

## Formulário

`/cadastro` é público, acessível pela entrada e usa Field/Input, Button e Alert.
Zod valida campos e resposta 201. A chamada direta ao cliente `postJson` envia
somente nome/e-mail/senha, com credentials omit e sem Authorization, retry,
Query mutation/cache, CSRF token ou storage local. Bloqueia reenvio pendente.
Senha/confirmação são limpas após tentativa HTTP; nome/e-mail permanecem nos
erros. Validação local permite corrigir sem limpar a senha. Erros focam o
primeiro campo ou resumo; sucesso foca “Conta criada” e oferece login, sem autenticar automaticamente.
Falha de rede ou resposta ilegível expressa incerteza, pois a transação pode
ter sido confirmada. Repetição é manual e pode receber 409.

## Validação e publicação

Execute verify com JDK 21/Docker e lint/typecheck/test/build frontend com versões
fixadas conforme AGENTS. Testes cobrem banco limpo, schema validate, constraints,
Argon2 real, concorrência em transações independentes, limites, privilégio
forjado, erros, CORS e cadeia real. As suítes existentes cobrem health/Swagger e
storage. Frontend testa serialização, validação, pendência, foco e limpeza.

Após revisão, publicar primeiro backend/Flyway pelo [guia backend](backend-deployment.md)
e depois frontend pelo [guia frontend](frontend-deployment.md). Usar a origem
canônica permitida, sem ampliar CORS. Roteiro de evidência na MR:

1. Registrar SHA, pipeline e deployment de ambos os serviços.
2. Abrir `/cadastro` pela entrada e diretamente, atualizar a rota, verificar
   teclado/foco, 360 px e zoom 200% sem overflow.
3. Cadastrar uma conta sintética identificável; confirmar 201, USER, no-store,
   ausência de Set-Cookie/sessão e UI “Conta criada”. Não anexar senha ou hash.
4. Repetir o e-mail com variação de caixa: 409 e erro de campo. Confirmar
   preflight POST/Content-Type, origem permitida e ausência de credentials.
5. Em ambiente isolado, parar e reiniciar apenas a aplicação mantendo o banco;
   repetir o cadastro e confirmar 409 e uma linha. Registrar esta prova
   separadamente da publicada. Não reiniciar produção para a demonstração.

Configuração ou testes locais não comprovam deploy. Enquanto a evidência
publicada faltar, usar Refs #34 e Refs #19, sem fechar as issues.

## Extensões

Login/recuperação reutilizam conta, canonicalEmail e PasswordEncoder. Login,
/me e logout estão descritos em [segurança](security.md); sessões estão em V3,
sem alterar V2 aplicada. Login não aplica o mínimo de senha de cadastro.
O [guia para recuperação](password-recovery-integration.md) define lock da conta,
troca de hash e revogação atômica. Recuperação e e-mail ainda não têm rotas.
O [ADR 0011](adr/0011-adotar-sessoes-jwt-revogaveis.md) atualiza CSRF e sessões;
o ADR 0010 preserva o histórico do compromisso de exposição de conta no 409.

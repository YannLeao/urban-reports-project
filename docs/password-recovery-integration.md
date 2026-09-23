# Integração futura de recuperação de senha — S2-R03/R04

A #35 entrega a sessão e a ponte transacional; não implementa solicitação, tokens,
migration de recuperação, Resend, e-mail ou telas de redefinição. O colega inclui
“Esqueci minha senha” em LoginPage somente quando existir rota real.

## Reuso e contrato

- Reutilizar identity/UserAccount, RegistrationValidation.canonicalEmail, política
  de senha do cadastro (extrair validador compartilhado ao implementar redefinição)
  e o PasswordEncoder Argon2id central. Não criar conta/encoder alternativos.
- Token de recuperação é aleatório próprio, persistido apenas como hash, com
  validade de 30 minutos e uso único. Não reutilizar JWT de acesso.
- Solicitação tem resposta genérica; nova solicitação invalida tokens anteriores
  ativos. Não registrar token/URL sensível em logs. Resend e link frontend são
  responsabilidade da implementação seguinte.
- Consumo do token, troca do hash e revogação global precisam confirmar juntos;
  não autenticar automaticamente. Após commit, orientar login sem senha ou token
  de acesso em URL.

## Protocolo obrigatório de transação e locks

`UserAccountRepository.lockById(userId)` usa SELECT FOR UPDATE. Toda redefinição
adquire **primeiro a conta**, depois o token de recuperação, depois altera sessões.
Ao precisar resolver userId pelo hash do token, uma leitura inicial pode localizar
a conta; releia e valide o token sob lock após travar a conta, incluindo expiração,
uso único e vínculo. Solicitação/consumo concorrentes devem seguir a mesma ordem.
Nunca inverter conta/token/sessões; operações em várias contas ordenam UUIDs.

Dentro de uma única transação do chamador:

```java
var account = accounts.lockById(userId).orElseThrow();
// Lock e validação do token próprio; marcar consumido na mesma transação.
account.changePasswordHash(newHash, instant);
revocation.revokeAllSessions(userId, instant);
// Commit do chamador antes de confirmar ao cliente.
```

`SessionRevocation.revokeAllSessions` exige transação existente (MANDATORY), usa o
mesmo banco e não abre REQUIRES_NEW. Falha deve causar rollback de tudo. O hash
novo pode ser calculado antes de adquirir lock; nunca reutilizar validação antiga
do token após aquisição. Não expor revogação global como endpoint administrativo.

Login carrega hash e verifica Argon2 fora da transação; depois trava a conta e
compara o hash novamente. Se mudou, retorna falha genérica sem sessão. Assim:
login que confirma antes do reset é revogado; login com senha antiga que tenta
confirmar depois do reset é recusado. Login usa propagação NEVER: rejeita transação de chamador para impedir leitura
antecipada no contexto JPA e retorno antes do commit real.

AuthenticationIntegrationTests exercita duas sessões, troca+revogação, rollback
de ambos e corrida determinística pausada após matches e antes do lock, sem
endpoint fictício. O teste usa serviço/transação real e PostgreSQL descartável.

## Testes exigidos na entrega seguinte

Token inválido/expirado/consumido, nova solicitação invalidando anterior, duas
redefinições concorrentes, consumo único, senha antiga falha/nova funciona,
sessões anteriores recusadas, corrida com login e rollback consistente inclusive
no consumo do token. Não confirmar envio/commit sem evidência real.

Referência: [OWASP Forgot Password](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).

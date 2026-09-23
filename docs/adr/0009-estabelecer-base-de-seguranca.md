# ADR 0009: Estabelecer base de segurança com Spring Security e Argon2id

- Status: aceito
- Data: 2026-09-23

## Contexto

A frente de cadastro/acesso precisa de política explícita de acesso antes de
introduzir contas e login. Endpoints técnicos de storage estavam públicos por
omissão. A prova de imagem frontend não faz upload. O ADR 0007 preserva Swagger
somente em dev e exige 404 nos demais ambientes.

## Decisão

- Integrar Spring Security à API com cadeia explícita, negação por padrão e
  permissão GET/HEAD apenas para health e caminhos de documentação existentes.
- Bloquear storage em todos os perfis até o contrato autorizado da #36.
- Preservar dispatch interno de erro sem abrir `/error` a requisições diretas.
- Consolidar CORS na cadeia, usando a allowlist exata existente, sem credentials.
- Manter CSRF habilitado nesta fase transitória. Sessão pode servir ao CSRF,
  mas autenticação não é carregada/persistida nela; usar contexto por requisição.
- Desabilitar login HTML, Basic, remember-me, logout padrão, request cache e
  auto-configuração de usuário. Não simular contas nem adicionar filtro JWT.
- Expor encoder Argon2id com 19 MiB, 2 iterações, paralelismo 1, salt de 16 bytes
  e hash de 32 bytes; manter formato autodescritivo e Bouncy Castle explícito.
- Reutilizar o envelope de erro existente nos handlers de segurança sem ampliar
  o advice de storage. Preservar convenção de mensagens em inglês.

## Consequências

O roteiro público de upload deixa de funcionar, inclusive em dev; o contrato
interno continua testado. Health e frontend público permanecem utilizáveis.
Esta decisão substitui a condição de API pública descrita como estado vigente
no ADR 0007, preservando integralmente sua política de documentação.

Não há autenticação implementada. CSRF pode negar POST com 403 antes de uma
recusa 401 de autorização. CORS rejeitado mantém o comportamento do framework.
Parâmetros Argon2id precisam de aferição no Render antes do fluxo real.

JWT foi escolhido para #35, mas transporte, armazenamento, renovação, duração,
assinatura/chaves e revogação ainda não foram decididos. Sessão persistida é
proposta, não implementação. #35 deve definir sessão ativa, invalidação imediata,
recuperação de senha e persistência após restart; JWT não resolve logout sozinho.
#34 deve decidir modelo/normalização de conta, política de senha e CSRF do
cadastro antes de liberar seu POST. Nenhuma migration é necessária nesta base.

Contrato operacional, testes e referências estão no [guia de segurança](../security.md).

# Migrations de banco de dados

O Flyway é a única fonte de verdade do schema. O Hibernate valida se o schema é
compatível com as entidades existentes, mas não cria, atualiza nem remove
estruturas.

## Convenção

As migrations ficam em `backend/src/main/resources/db/migration` e seguem o
formato `V<versão>__<descrição>.sql`, por exemplo:

```text
V1__create_schema_probe.sql
V2__create_user_accounts.sql
V3__create_auth_sessions.sql
```

Depois que uma migration for aplicada em qualquer ambiente compartilhado, seu
conteúdo é imutável. Correções e remoções devem ser feitas em uma nova migration,
nunca alterando um arquivo anterior.

A V2 cria as contas do [cadastro](identity.md), com UUID, e-mail canônico único,
Argon2id, USER e timestamps UTC. Os testes de cadastro validam constraints e
concorrência em PostgreSQL descartável.

A V3 cria [sessões revogáveis](security.md): UUID/jti, FK user_id, instantes UTC,
revoked_at opcional, CHECK de expiração e índice por conta. Não altera V1/V2,
não guarda JWT bruto e não inclui tokens de recuperação. Retenção/limpeza de
sessões inativas fica para uma política futura.

## Como o checksum protege o histórico

Ao aplicar uma migration, o Flyway registra sua versão, nome e checksum na tabela
`flyway_schema_history`. Nas próximas inicializações, o conteúdo versionado é
comparado ao histórico. Se uma migration aplicada tiver sido editada, a validação
falha e o backend não inicia com um schema de origem ambígua.

## Roteiro manual de demonstração

Este roteiro deve ser executado somente em um banco local descartável e toda
alteração temporária deve ser desfeita antes de criar um commit.

1. Inicie o PostgreSQL local e o backend para aplicar a `V1` original.
2. Encerre o backend sem apagar o banco.
3. Faça uma alteração temporária em `V1__create_schema_probe.sql`.
4. Inicie o backend novamente e confirme que o Flyway interrompe a inicialização
   com erro de validação/checksum.
5. Desfaça integralmente a alteração temporária.
6. Inicie novamente e confirme que o schema está atualizado sem reaplicar a V1.
7. Execute `git diff --exit-code` para garantir que a migration original continua
   intacta.

Não utilize `repair` para aceitar uma edição indevida. Esse comando altera o
histórico e só pode ser considerado após uma decisão explícita da equipe para
recuperar um ambiente específico.

## Testes automatizados

Com o Docker ativo:

```bash
cd backend
./mvnw test
```

O Testcontainers inicia PostgreSQL real em uma porta aleatória. O teste de
migration confirma a aplicação da V1, a existência de `schema_probe`, inserção e
leitura, o valor padrão de `checked_at`, o registro no histórico e a ausência de
reaplicação quando o schema já está atualizado.


## Versões por ambiente

O Compose usa `postgres:16-alpine`; Testcontainers e o exemplo de banco isolado
usam `postgres:17-alpine`. Ao reproduzir um problema, confira a versão do ambiente
alvo. Alinhar versões principais exige uma alteração própria de infraestrutura,
com análise de compatibilidade e migração dos dados existentes; trocar a tag não
atualiza um volume PostgreSQL de outra versão. Não exclua volumes como rotina de
validação.

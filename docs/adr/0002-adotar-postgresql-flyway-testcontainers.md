# ADR 0002: Adotar PostgreSQL, Flyway e Testcontainers

- Status: aceito
- Data: 2026-08-29

## Contexto

O backend precisa evoluir um schema relacional de modo reproduzível em ambientes
locais, no CI e no deploy. As funcionalidades das próximas sprints serão
implementadas verticalmente por integrantes diferentes, portanto mudanças de
banco precisam possuir ordem, histórico e falhas explícitas. Testes que simulam
PostgreSQL com outro banco não comprovam compatibilidade com os tipos e o dialeto
utilizados em produção.

## Decisão

- Utilizar PostgreSQL como banco relacional oficial.
- Utilizar Flyway como única fonte de criação e evolução do schema.
- Manter migrations versionadas e imutáveis em
  `backend/src/main/resources/db/migration`.
- Configurar o Hibernate com `ddl-auto=validate`, impedindo criação ou alteração
  automática das tabelas.
- Executar testes de integração com PostgreSQL real e descartável por meio do
  Testcontainers, sem substituir o banco por H2.
- Injetar os dados de conexão dos containers com `@ServiceConnection`, mantendo
  os testes independentes de portas ou credenciais fixas.

## Consequências

- Toda mudança futura de schema exige uma nova migration; uma migration aplicada
  não pode ser reescrita.
- Uma migration incompatível ou com checksum alterado impede a inicialização, em
  vez de modificar silenciosamente o banco.
- A suíte de integração exige Docker disponível e pode levar mais tempo que
  testes puramente unitários.
- Cada funcionalidade pode validar migration, persistência e consultas contra o
  mesmo banco utilizado pela aplicação.
- A tabela inicial `schema_probe` é apenas uma prova técnica e não representa uma
  entidade do domínio.


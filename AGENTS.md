# Instruções de trabalho

## Mapa e leitura inicial

- Confira branch, alterações locais e instruções aplicáveis antes de editar;
  preserve trabalho existente e implemente o escopo da tarefa recebida.
- `backend/`: API Spring Boot, Maven Wrapper, migrations e testes Java.
  `frontend/`: aplicação React/TypeScript/Vite. `docs/`: guias e decisões.
- A raiz contém [docker-compose.yml](docker-compose.yml) e
  [.gitlab-ci.yml](.gitlab-ci.yml); cada aplicação tem seu `Dockerfile`.
  Os jobs por aplicação ficam em `infrastructure/gitlab-ci/`, incluídos pelo
  YAML da raiz; o Compose permanece único para os três serviços.
- Leia [CONTRIBUTING.md](CONTRIBUTING.md), [README.md](README.md) e os
  [ADRs](docs/adr/README.md) e guias pertinentes antes de implementar:
  [banco](docs/database-migrations.md), [imagens](docs/image-storage.md),
  [deploy backend](docs/backend-deployment.md),
  [deploy frontend](docs/frontend-deployment.md) e
  [desenvolvimento frontend](docs/frontend-development.md).
- Tarefas locais ficam em `temp/sprint-<n>/tasks/#<issue>-task.md`. `temp/` é
  ignorado pelo Git: não force seu versionamento. Registre decisões duráveis em
  `docs/` e evidências de entrega na MR/issue; as instruções permanentes não
  devem depender de arquivos ignorados.
- Confira documentação contra a configuração vigente. Relate divergências que
  exijam decisão arquitetural; não as resolva silenciosamente.

## Backend e banco

- Use Java 21 e o Maven Wrapper em `backend/`. Confira `JAVA_HOME` e o JDK
  efetivamente usado na execução; não presuma que o Java padrão está correto.
- O pacote raiz é `com.project.software.urbanreports`, com `health/`, `config/`
  e `storage/`. Este último separa `api/`, `application/` e `infrastructure/`.
  Siga os padrões locais pertinentes, sem impor essa divisão a todo o sistema.
- Evolua o schema por Flyway em `backend/src/main/resources/db/migration/` e
  mantenha Hibernate em `ddl-auto=validate`. Não edite migrations aplicadas em
  ambientes compartilhados. Confira as versões existentes e coordene numeração
  com trabalho concorrente antes de adicionar uma migration.
- Preserve a abstração `ImageStorage`; evite acoplar regras de negócio ao SDK
  ou provedor. Siga o [ADR de armazenamento](docs/adr/0003-adotar-cloudflare-r2-para-armazenamento-de-imagens.md).
- Testes com Testcontainers exigem Docker disponível e PostgreSQL real
  descartável, conforme o [ADR de banco](docs/adr/0002-adotar-postgresql-flyway-testcontainers.md).
  Reporte a falta do pré-requisito; não desabilite testes para simular aprovação.

## Frontend

- Use Node 22.23.2 (`frontend/.node-version`) e pnpm 10.34.5
  (`packageManager`), com `pnpm-lock.yaml` e instalação frozen. npm serve apenas
  para bootstrap do pnpm; não gerencia dependências/scripts do aplicativo.
- Preserve TypeScript `strict`, lint e checagem de tipos. O script `build`
  executa `pnpm tokens:check && tsc -b && vite build`, além do script explícito `typecheck`.
- Scripts e testes em `frontend/scripts/` usam `.ts`, NodeNext e strict via
  `tsconfig.scripts.json`, incluído em `tsc -b`. Node 22 executa-os diretamente
  por remoção de tipos; isso não substitui typecheck. Preserve imports `.ts`,
  `erasableSyntaxOnly` e validação de JSON externo antes de uso.
- `src/app/` compõe providers e rotas; `src/pages/` contém páginas;
  `src/lib/api.ts` concentra fetch/configuração; `src/features/health/` contém
  a consulta validada e sua apresentação. Use Router declarativo, Query para
  estado de servidor e Zod nas fronteiras conforme os padrões implementados.
- Consulte [docs/design-system](docs/design-system/README.md) antes de alterar UI.
  Use os tokens canônicos em `docs/design-system/tokens.ts` e os componentes de
  `frontend/src/components/ui/`; atualize documentação, catálogo e código juntos.
  Execute `pnpm tokens:generate` após editar tokens e versione o CSS gerado;
  `pnpm tokens:check` valida sem escrever e precede o build.
- Priorize utilitários Tailwind em páginas e componentes. Reserve CSS manual
  para defaults globais, integração de ferramentas ou exceção justificada no
  guia de design system. Reutilize variantes com classes completas e estáticas;
  não construa nomes Tailwind por interpolação nem duplique tokens.
- Tailwind 4 está integrado ao Vite com variáveis semânticas via `@theme inline`.
  `pnpm test` executa node:test dos scripts de CI/deploy e Vitest/Testing Library;
  use cliente Query novo por caso e fetch controlado, sem API real.
- Publicação frontend usa Vercel CLI fixada no lockfile, artefato Build Output
  API v3 e job manual `frontend:deploy` da branch padrão protegida. Preserve
  `needs` de build/lint/testes, rastreabilidade do pipeline e roteamento na saída
  prebuilt. Não habilite previews ou deploy paralelo pela integração Git.
- `VITE_API_URL` é incorporada no build. Valores `VITE_*` são públicos no bundle:
  nunca inclua credenciais. Alterar a URL exige recompilar o frontend.

## Configuração e segurança

- Não versione segredos, `.env` reais, tokens ou credenciais. Use placeholders
  nos [exemplos backend](backend/.env.example) e
  [frontend](frontend/.env.example); atualize exemplos e guias quando mudar a
  configuração. Não copie valores privados para logs, documentação ou relatos.
- O backend importa opcionalmente `.env` relativo ao diretório de execução.
  O Compose não carrega automaticamente os `.env` das aplicações: confira sua
  interpolação e as variáveis transmitidas aos serviços.
- Leia [segurança](docs/security.md) antes de alterar endpoints. A cadeia usa
  negação por padrão; storage técnico está bloqueado inclusive em dev. Preserve
  health público, matriz Swagger e CSRF habilitado, com exceção somente POST
  `/api/auth/register` JSON.
  CORS tem fonte única na cadeia Security, sem credentials. Não crie autenticação
  fictícia nem trate identidade simulada de teste como suporte JWT.
- Reutilize o PasswordEncoder Argon2id central e o DTO de erro em `api/`.
  Reutilize `identity/UserAccount` e `RegistrationValidation.canonicalEmail`
  em login/recuperação; consulte [identidade](docs/identity.md). Cadastro não
  autentica, ignora campos extras só em seu DTO e sempre cria USER.
  Testes internos de storage sem filtros não substituem testes com cadeia real.
- Não altere banco remoto nem exclua volumes ou recursos externos como rotina
  de validação. Não use `docker compose down -v` como limpeza padrão.
- Evite mudanças incidentais de dependências, formatação em massa e correções
  fora do escopo recebido.

## Comandos e validação

Execute no diretório indicado. Downloads de dependências, Maven ou imagens
exigem acesso aos respectivos repositórios quando não estiverem em cache.

| Finalidade | Diretório | Comando | Pré-requisitos |
| --- | --- | --- | --- |
| Instalar frontend pelo lockfile | `frontend/` | `pnpm install --frozen-lockfile` | Node/pnpm fixados e lockfile |
| Desenvolvimento frontend | `frontend/` | `pnpm run dev` | Dependências instaladas; `VITE_API_URL` e API acessível para consultar health |
| Lint frontend | `frontend/` | `pnpm run lint` | Node/pnpm e dependências instaladas |
| Tipos e build frontend | `frontend/` | `pnpm run build` | Node/pnpm e dependências instaladas; URL configurada para o bundle de destino |
| Tipos frontend | `frontend/` | `pnpm run typecheck` | Node/pnpm e dependências instaladas |
| Testes frontend e script de CI | `frontend/` | `pnpm test` | Node/pnpm e dependências instaladas; sem API real |
| Verificação backend | `backend/` | `./mvnw verify` | JDK 21, Wrapper e Docker disponível para Testcontainers |
| Desenvolvimento backend | `backend/` | `./mvnw spring-boot:run -Dspring-boot.run.profiles=dev` | JDK 21, Wrapper, PostgreSQL acessível e configuração de conexão |
| Validação estática do Compose | raiz | `docker compose config --quiet` | Docker CLI com Compose e variáveis de interpolação pertinentes |

Swagger/OpenAPI ficam desabilitados na base e em `prod`; o perfil `dev` é
opt-in local. `./mvnw verify` cobre os três contextos por HTTP, com PostgreSQL
descartável, incluindo ativação por `SPRING_PROFILES_ACTIVE` em arquivo `.env`.
Na IDE, execute com `backend/` como diretório de trabalho para importar esse
arquivo. Não injete flags springdoc nos testes para mascarar a configuração
real. Compose aceita `SPRING_PROFILES_ACTIVE` explicitamente, sem ativar dev
por padrão. Perfis Spring não são autenticação nem profiles do Compose.

O boot backend executa Flyway e precisa de banco configurado. R2 não é
obrigatório para iniciar: sem `IMAGE_STORAGE_ENDPOINT`, a integração fica
desativada e o serviço interno de imagem fica indisponível. Os endpoints
técnicos permanecem bloqueados pela cadeia de segurança. Para configurar a
integração interna, siga o guia de storage; não reutilize placeholders como credenciais reais.

`docker compose config` valida configuração, não serviços operacionais.
`pnpm run build` não verifica todas as exigências de produção de
`frontend/scripts/build-ci.ts`; confira o script e o guia de deploy quando
alterar esse fluxo. Configuração existente não comprova funcionamento remoto.

Selecione verificações pela área e comportamento alterados, com testes
significativos quando necessário. Para mudança apenas documental, revise
comandos, caminhos, links e diff, incluindo `git diff --check`; não é necessário
executar toda a aplicação. Registre separadamente aprovações, falhas e
verificações não executadas, com motivo. Nunca declare deploy, pipeline remoto
ou teste manual aprovado apenas por existir configuração para ele.

## Documentação e entrega

- Siga branches, commits, template de MR e revisão de CONTRIBUTING. Relacione
  a issue; em entrega parcial, use `Refs #<número>` para não encerrar a issue
  agregadora. Use fechamento somente quando a entrega concluir seu escopo.
- Mantenha guias focados no contrato e na operação atuais; resultados datados,
  aceite e histórico de entrega pertencem à MR/issue. Preserve decisões em ADRs.
- Atualize guias quando comportamento/configuração mudar e registre decisões
  arquiteturais relevantes conforme o padrão dos ADRs. Mantenha este arquivo
  atualizado quando comandos ou convenções mudarem.
- No retorno, informe resumo, arquivos alterados, decisões, verificações com
  resultados e limitações, além de descrição sugerida da MR relacionada à issue.
  A descrição deve explicar problema, mudança, comportamento resultante e
  evidências. Revisão e pipeline seguem CONTRIBUTING; não faça merge automático.

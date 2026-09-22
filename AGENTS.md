# Instruções de trabalho

## Mapa e leitura inicial

- Confira branch, alterações locais e instruções aplicáveis antes de editar;
  preserve trabalho existente e implemente o escopo da tarefa recebida.
- `backend/`: API Spring Boot, Maven Wrapper, migrations e testes Java.
  `frontend/`: aplicação React/TypeScript/Vite. `docs/`: guias e decisões.
- A raiz contém [docker-compose.yml](docker-compose.yml) e
  [.gitlab-ci.yml](.gitlab-ci.yml); cada aplicação tem seu `Dockerfile`.
  `infrastructure/docker/` e `infrastructure/gitlab-ci/` são diretórios
  preparados para auxiliares, atualmente com `.gitkeep`.
- Leia [CONTRIBUTING.md](CONTRIBUTING.md), [README.md](README.md) e os
  [ADRs](docs/adr/README.md) e guias pertinentes antes de implementar:
  [banco](docs/database-migrations.md), [imagens](docs/image-storage.md),
  [deploy backend](docs/backend-deployment.md) e
  [deploy frontend](docs/frontend-deployment.md).
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

- O fluxo vigente usa React/TypeScript/Vite, npm e `frontend/package-lock.json`.
  Preserve instalação pelo lockfile. Atualize estas instruções quando uma tarefa
  implementar a troca de gerenciador; não antecipe essa mudança.
- Preserve TypeScript `strict`, lint e checagem de tipos. O script `build`
  executa `tsc -b && vite build`.
- Não há script `test`, Router, TanStack Query ou design system compartilhado
  implementados. Confira `package.json` e a árvore atual antes de documentar
  comandos ou componentes como disponíveis.
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
- CORS não é autenticação. `/api/storage/images` é uma prova técnica, não o
  contrato definitivo de ocorrência.
- Não altere banco remoto nem exclua volumes ou recursos externos como rotina
  de validação. Não use `docker compose down -v` como limpeza padrão.
- Evite mudanças incidentais de dependências, formatação em massa e correções
  fora do escopo recebido.

## Comandos e validação

Execute no diretório indicado. Downloads de dependências, Maven ou imagens
exigem acesso aos respectivos repositórios quando não estiverem em cache.

| Finalidade | Diretório | Comando | Pré-requisitos |
| --- | --- | --- | --- |
| Instalar frontend pelo lockfile | `frontend/` | `npm ci` | Node compatível com as dependências, npm e lockfile |
| Desenvolvimento frontend | `frontend/` | `npm run dev` | Dependências instaladas; `VITE_API_URL` e API acessível para consultar health |
| Lint frontend | `frontend/` | `npm run lint` | Node/npm e dependências instaladas |
| Tipos e build frontend | `frontend/` | `npm run build` | Node/npm e dependências instaladas; URL configurada para o bundle de destino |
| Teste do script de CI | `frontend/` | `node --test scripts/build-ci.test.mjs` | Node com suporte a `node:test`; não exige API real |
| Verificação backend | `backend/` | `./mvnw verify` | JDK 21, Wrapper e Docker disponível para Testcontainers |
| Desenvolvimento backend | `backend/` | `./mvnw spring-boot:run` | JDK 21, Wrapper, PostgreSQL acessível e configuração de conexão |
| Validação estática do Compose | raiz | `docker compose config --quiet` | Docker CLI com Compose e variáveis de interpolação pertinentes |

O boot backend executa Flyway e precisa de banco configurado. R2 não é
obrigatório para iniciar: sem `IMAGE_STORAGE_ENDPOINT`, a integração fica
desativada e operações de imagem ficam indisponíveis. Para usá-la, configure o
storage conforme o guia; não reutilize placeholders como credenciais reais.

`docker compose config` valida configuração, não serviços operacionais.
`npm run build` não verifica todas as exigências de produção de
`frontend/scripts/build-ci.mjs`; confira o script e o guia de deploy quando
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
- Atualize guias quando comportamento/configuração mudar e registre decisões
  arquiteturais relevantes conforme o padrão dos ADRs. Mantenha este arquivo
  atualizado quando comandos ou convenções mudarem.
- No retorno, informe resumo, arquivos alterados, decisões, verificações com
  resultados e limitações, além de descrição sugerida da MR relacionada à issue.
  A descrição deve explicar problema, mudança, comportamento resultante e
  evidências. Revisão e pipeline seguem CONTRIBUTING; não faça merge automático.

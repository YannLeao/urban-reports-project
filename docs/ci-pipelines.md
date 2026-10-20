# Pipelines e economia temporária de minutos

A política temporária da #59 concentra as validações nos merge requests para
reduzir consumo da quota compartilhada. Na branch padrão, mantém somente o
necessário para os deploys manuais. É uma exceção operacional reversível ao
encadeamento de validação e deploy descrito nos ADRs [0004](adr/0004-centralizar-deploy-do-backend-no-gitlab-ci-cd.md)
e [0006](adr/0006-publicar-frontend-na-vercel-pelo-gitlab.md).

## Eventos e caminhos

O `workflow` aceita somente `merge_request_event` e `push` na branch padrão.
Push em branch de trabalho, com ou sem MR, não cria pipeline de branch; com MR,
o evento de MR recebe a validação aplicável, inclusive após rebase e push.
Tags, schedules, API, triggers e **New pipeline** (`web`) ficam bloqueados.
Não há configuração específica de schedules/triggers no repositório. O fluxo
anterior aceitava fontes com `CI_COMMIT_BRANCH`, e os guias indicavam **New
pipeline** para redeploy; esse procedimento passa a usar retry dos jobs abaixo.
O uso remoto de outras fontes deve ser conferido pelo mantenedor antes da adoção.
Se houver uma fonte essencial, revisar a política e adicionar regras explícitas
compatíveis ao workflow e aos jobs antes do merge.

| Alteração | MR | Push na branch padrão |
|---|---|---|
| `backend/**/*`, `infrastructure/gitlab-ci/backend.yml` | `backend:build` → `backend:test` | `backend:deploy` manual |
| `frontend/**/*`, `docs/design-system/**/*`, `.dockerignore`, `docker-compose.yml`, `infrastructure/gitlab-ci/frontend.yml` | `frontend:build` → `frontend:lint` | `frontend:build` → `frontend:deploy` manual (branch protegida) |
| `.gitlab-ci.yml` | validações das duas aplicações | deploy backend manual, build e deploy frontend manual |
| Caminhos fora desses filtros | nenhum job | nenhum job |

Alterações nas duas aplicações combinam os respectivos jobs. Infraestrutura
fora dos caminhos listados não aciona suítes. Nenhum `needs` é opcional:
os jobs dependentes usam os mesmos caminhos dos produtores. Backend deploy
usa `needs: []`; frontend deploy recebe os artefatos obrigatórios do build.

`rules:changes` compara o MR com sua branch de destino e, no push da branch
padrão, com o commit anterior. Não se fixa `compare_to` na própria branch
padrão, pois isso impediria detectar alterações no push. Ver
[referência GitLab](https://docs.gitlab.com/ci/yaml/#ruleschanges).

Comandos de teste, cache e relatórios JUnit permanecem iguais. O job frontend
de lint mantém lint, typecheck e testes, exclusivamente no MR. O build de
produção ainda executa `tokens:check` e TypeScript porque fazem parte de
`pnpm run build`; somente o job separado deixa de se repetir na branch padrão.
A economia vem da ausência de pipelines de branches sem MR, compile/teste
backend na branch padrão e repetição do job frontend de lint/testes.
Não há estimativa de minutos ou percentual.

## Deploy e repetição

Após revisar o pipeline de MR, abra o pipeline de **push da branch padrão**
com as mudanças pertinentes. Acione `backend:deploy` para chamar o Render com
o SHA desse pipeline, ou aguarde `frontend:build` verde e acione
`frontend:deploy` para publicar seu artefato prebuilt na Vercel. Variáveis,
ambientes, serialização frontend e scripts de deploy permanecem iguais.

Para redeploy, use retry do job manual no pipeline original quando permitido.
Se os artefatos frontend expirarem (sete dias), tente novamente
`frontend:build` no mesmo pipeline, confirme a geração dos artefatos e repita o
deploy. Isso recompila o mesmo SHA com a configuração de build vigente e mantém
a correspondência de SHA/ref/pipeline exigida pelo script. Se retry não estiver
disponível, use um novo push revisado com mudanças pertinentes; **New pipeline**
não é uma alternativa sob esta política. Siga também os controles contra deploy
de jobs antigos do [guia frontend](frontend-deployment.md).

## Validação e governança antes do merge

No **Build > Pipeline editor > Validate**, valide a configuração completa com
os dois includes, usando os arquivos alterados. Quando houver simulação
disponível, confira MR e push na branch padrão para backend, frontend, ambos,
`.gitlab-ci.yml`, cada include, Compose, design system e caminhos não monitorados.
Confira também push de branch de trabalho, tag e fontes bloqueadas.
Não acione deploy para validar as regras. Parse YAML e simulação local de regras
não substituem [CI Lint](https://docs.gitlab.com/ci/lint/).

Um mantenedor deve conferir no GitLab, sem alterar configurações implicitamente:

- Proteção da branch padrão e bloqueio de push direto; sem isso, um push pode
  oferecer deploy sem nenhuma validação de MR.
- Exigência de pipeline bem-sucedido antes do merge e impossibilidade de ignorar
  falhas das validações relevantes.
- Disponibilidade/ativação de merged results pipelines. MR convencional valida
  a origem; não comprova o resultado exato do merge nem o SHA final publicado.
- Comportamento de merge para MR sem jobs por caminhos não monitorados:
  conferir se pipeline ausente/vazio bloqueia o merge na configuração do projeto.
- Schedules, triggers, integrações e uso de pipelines `web`/API no projeto.

O YAML local não comprova essas configurações remotas. Sem essa conferência e
CI Lint, o aceite remoto da #59 permanece pendente. A nova política exige revisão
humana da validação do MR antes do deploy; não há mais bloqueio por testes na
branch padrão. Os comandos de desenvolvimento e verificação locais não mudam.

## Reversão

Quando a quota ou a política mudar, reverta a alteração da #59 por MR revisada,
incluindo documentação. Restaure o workflow anterior, as regras por caminhos
de build/testes backend e lint frontend, os `needs` de build/teste no deploy
backend e o `needs` de lint no deploy frontend em conjunto. Valide novamente
a matriz de eventos no CI Lint antes do merge para evitar dependências ausentes.

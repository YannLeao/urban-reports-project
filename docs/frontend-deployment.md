# Deploy público do frontend na Vercel

## Fluxo e artefato

```text
frontend:build → frontend:lint → frontend:deploy (manual)
     ↓                              ↑
.vercel/output/ + artifact.json ─────┘
```

GitLab CI valida e publica; Vercel hospeda somente arquivos estáticos. Backend,
banco e imagens continuam no Render, Neon e R2. Não há proxy, funções serverless
ou previews automáticos. Desconecte a integração Git do projeto Vercel para não
haver uma segunda publicação automática.

Os jobs usam Node 22.23.2, pnpm 10.34.5 e `pnpm install --frozen-lockfile`.
Vercel CLI 59.25.4 é uma devDependency exata, resolvida pelo mesmo lockfile.
O bootstrap npm instala apenas o pnpm definido em `packageManager`.
Os scripts `.ts` são executados diretamente pelo Node; a checagem strict é
realizada por `tsc -b`, incluindo `tsconfig.scripts.json`, antes da publicação.

`frontend:build` executa TypeScript/Vite uma vez, com base `/`, e empacota `dist`
com `scripts/package-vercel.ts`. A saída segue Build Output API v3:

- `.vercel/output/static/`: bytes de `dist`, incluindo HTML, JS e CSS;
- `.vercel/output/config.json`: versão e regras de roteamento;
- `.vercel/artifact.json`: SHA, ref, pipeline, indicação de produção e URL
  pública da API; fica fora da raiz estática.

O empacotamento exige `dist/index.html` não vazio, rejeita arquivos ocultos,
source maps e links simbólicos. Limpa somente `.vercel/output`; preserva eventual
`.vercel/project.json`. Não copia `.env`, código-fonte ou `node_modules` da raiz.
Revise também o conteúdo de `public/`: seus arquivos entram no bundle público.
Nunca inclua segredos em `VITE_*`.

O GitLab arquiva somente output e metadados por sete dias. Não arquiva `.vercel/`
inteira nem o vínculo local. Se o artefato expirou, inicie **novo pipeline** da
branch padrão e execute todas as verificações novamente.

`frontend:lint` executa lint, typecheck e testes Node/Vitest. O deploy tem `needs`
explícitos para build e lint, portanto aguarda todas essas verificações. Publica
com `pnpm exec vercel deploy --prebuilt --prod`, sem build remoto ou recompilação
no job de deploy. Antes da CLI, o script valida variáveis, branch protegida e
correspondência do SHA/ref/pipeline do artefato. A CLI recebe esses identificadores
como metadados; a URL específica do deployment aparece no log do job.

MRs e outras branches somente validam. A branch padrão protegida oferece o job
manual, com `allow_failure: false`; falta de configuração falha explicitamente.
Os jobs ficam em `infrastructure/gitlab-ci/frontend.yml`, incluído pela raiz.
Mudanças nesse arquivo, em `frontend/`, `docs/design-system/`, `.dockerignore`,
`docker-compose.yml` e `.gitlab-ci.yml` acionam a esteira.
Os jobs backend mantêm seu fluxo separado.

## Configuração externa

Não envie tokens por chat nem os salve no repositório. Um mantenedor com acesso
às contas deve conferir este checklist ao configurar ou alterar o ambiente.

1. **Vercel:** crie ou selecione o projeto na conta/equipe correta, com framework
   **Other**, sem integração Git conectada e sem build remoto. Como a CLI roda
   dentro de `frontend/`, deixe **Root Directory** vazio (raiz do diretório enviado),
   não `frontend`. Em **Settings > General**, confira o Project ID; nas configurações
   da equipe, confira o Team ID (ORG_ID). Alternativamente, depois de autenticar
   localmente, `pnpm exec vercel link` em `frontend/` permite escolher o projeto
   existente e grava os IDs em `.vercel/project.json`, ignorado pelo Git.
2. **Vercel > Settings > Domains:** obtenha a origem canônica HTTPS atribuída ao
   projeto, sem barra final. O domínio padrão é suficiente. Confira em
   **Deployment Protection** que produção pode ser acessada sem login Vercel.
   Verifique permissões, autoria de commits e limites do plano existente. Não
   compre plano/domínio nem altere autoria para contornar restrições.
3. **Vercel > Account Settings > Tokens:** crie um token com acesso à equipe
   correta e cadastre-o diretamente no GitLab. Não cadastre uma segunda
   `VITE_API_URL` no painel Vercel: o bundle já vem pronto do GitLab.
4. **GitLab > Settings > CI/CD > Variables:** configure a tabela abaixo. Proteja
   a branch padrão em **Settings > Repository > Branch rules**. Mantenha desativado
   o acesso de pipelines de MR a variáveis/runners protegidos; não disponibilize
   credenciais a forks ou branches não protegidas.
5. **GitLab > Settings > CI/CD > General pipelines:** habilite **Prevent outdated
   deployment jobs** e desmarque **Allow job retries for rollback deployments**.
   O YAML serializa publicações com `resource_group: production-frontend` e não
   interrompe um deploy em andamento. A configuração de jobs antigos é feita no
   projeto, não pelo YAML. Se disponível no plano, proteja também o environment
   `production/frontend` para limitar quem pode acionar publicação.
6. **Render > serviço backend > Environment:** acrescente a origem canônica exata
   a `FRONTEND_ALLOWED_ORIGINS`, preservando as origens legítimas atuais. Aplique
   a configuração pelo fluxo operacional do serviço, conforme o
   [guia backend](backend-deployment.md), e valide o resultado.

| Variável GitLab | Conteúdo | Proteção | Environment scope |
|---|---|---|---|
| `BACKEND_PRODUCTION_URL` | URL HTTPS real da API | Protected | `*` (inclui build sem environment) |
| `FRONTEND_PRODUCTION_URL` | Origem canônica HTTPS Vercel, sem barra final | Protected | `production/frontend` |
| `VERCEL_TOKEN` | Token da conta/equipe correta | Masked, Protected; Hidden se disponível | `production/frontend` |
| `VERCEL_ORG_ID` | ID real da conta/equipe | Protected | `production/frontend` |
| `VERCEL_PROJECT_ID` | ID real do projeto | Protected | `production/frontend` |

Os IDs e URLs não são segredos. A CLI instalada aceita ORG_ID/PROJECT_ID pelo
ambiente; CI não precisa arquivar `project.json`, executar `vercel pull` ou
buscar variáveis de build na Vercel. Permissões e aceitação do pacote devem ser conferidas no deploy autenticado.

## API, rotas e CORS

`scripts/build-ci.ts` converte `BACKEND_PRODUCTION_URL` em `VITE_API_URL`.
Na branch padrão, exige URL HTTPS válida sem credenciais, query ou fragmento,
rejeitando também localhost e endereços de loopback.
Não usa fallback local em produção. Nas branches/MRs sem variável protegida,
usa `VITE_API_URL` ou localhost apenas para validar; o deploy rejeita esses
artefatos. Alterar a URL da API exige novo build e publicação.

A configuração **dentro da saída prebuilt** consulta o filesystem primeiro.
Arquivos existentes mantêm seus tipos; `/assets` e arquivos inexistentes com
extensão recebem 404. Demais caminhos GET/HEAD carregam `index.html`, permitindo
abrir/atualizar `/status` e exibir a tela React de não encontrado em páginas
inexistentes. Caminhos com extensão são reservados a arquivos, não a páginas.
Não há política de cache imutável para HTML. Nginx e um `vercel.json` externo
não determinam essas regras.

CORS continua configurado pelo backend, sem mudanças Java ou autenticação.
A allowlist aceita origens exatas separadas por vírgula, sem path/barra final.
Não use `*`, `*.vercel.app` ou cada URL efêmera de deployment. A integração é
validada pela **origem canônica**, que pode diferir da URL específica da CLI.
CORS não é autenticação e não corrige API URL incorreta ou mixed content.

## Compose local

Na raiz, `docker compose config --quiet` valida somente a configuração.
`docker compose up --build` usa `VITE_API_URL` como build arg frontend e transmite
`FRONTEND_ALLOWED_ORIGINS` ao backend (padrões `http://localhost:8080` e
`http://localhost:5173`, respectivamente). A interpolação vem do shell, `.env` da
**raiz** ou de `docker compose --env-file <arquivo-local> ...`; os `.env` de cada
aplicação não são carregados automaticamente pelo Compose.

Para acesso em outro dispositivo, configure o endereço alcançável da API e a
origem real do frontend, depois reconstrua o frontend. `localhost` no navegador
de um celular aponta para o próprio celular. Não remova volumes para validar.
Os avisos de R2 ausente indicam que storage não foi configurado; não use os
placeholders de `backend/.env.example` como credenciais reais.

## Verificação local e publicação

Em `frontend/`, após preparar Node/pnpm:

```bash
pnpm install --frozen-lockfile
pnpm run lint
pnpm run typecheck
pnpm test
CI_DEFAULT_BRANCH=main CI_COMMIT_BRANCH=main \
  BACKEND_PRODUCTION_URL=https://api.example.com node scripts/build-ci.ts
CI_DEFAULT_BRANCH=main CI_COMMIT_BRANCH=main \
  BACKEND_PRODUCTION_URL=https://api.example.com node scripts/package-vercel.ts
```

Esse exemplo usa uma URL fictícia e gera evidência local, não artefato publicável
pelo CI. O script de deploy exige os metadados reais do pipeline. Os testes de
rotas verificam o contrato da configuração; não simulam a infraestrutura Vercel.
Valide o YAML também no **GitLab > Build > Pipeline editor > Validate**. Parse
local e revisão de `needs` não substituem o CI Lint nem um pipeline remoto.

Depois de revisão e merge normal (sem merge automático):

1. Confirme build/lint/testes verdes no pipeline da branch padrão. Registre SHA
   e link do pipeline; acione `frontend:deploy` e registre link do job e URL/ID
   do deployment retornado. Confirme os metadados na Vercel.
2. Abra `FRONTEND_PRODUCTION_URL` em janela sem sessão Vercel: deve estar pública
   por HTTPS. Abra `/status` diretamente e atualize. Confira JS/CSS, seus tipos
   e ausência de erros no console/Network.
3. Abra `/pagina-inexistente` e confira a tela React. Solicite
   `/assets/inexistente.js` e `/inexistente.css`: devem responder 404, sem HTML
   com status de sucesso.
4. Na página `/status`, comprove a consulta real à API configurada e UI de
   sucesso, sem mixed content/CORS. Confira no bundle/Network que a URL é a de
   produção e que não há credenciais. Não registre conteúdos sensíveis.
5. Teste uma origem permitida e uma não autorizada contra `/api/health`, além de
   OPTIONS com `Access-Control-Request-Method: GET`. Registre o preflight como
   teste explícito; GET simples pode não gerar OPTIONS no navegador. HTTP 200
   em curl sozinho não prova integração CORS no navegador.
6. Anexe SHA, links/resultados e captura pertinente à MR da alteração.

## Diagnóstico e rollback

- Build sem `BACKEND_PRODUCTION_URL`: confira proteção e scope `*` no GitLab;
  não substitua por localhost nem use `allow_failure`.
- Deploy sem variáveis: confira scope `production/frontend`, proteção da branch
  e IDs reais. Não imprima tokens nem habilite debug para compartilhá-los.
- Artefato ausente, expirado ou de outro pipeline: gere novo pipeline validado.
- Falha de autenticação, plano ou autoria na Vercel: registre código/mensagem
  sem segredos e ajuste acesso/conta com o responsável. Não contorne restrições.
- 401/login no frontend: revise Deployment Protection da produção.
- Tela abre mas health falha: confira URL incorporada, disponibilidade Render,
  HTTPS e allowlist. A URL específica do deployment não recebe CORS automático.
- Refresh ou assets falham: confira `output/config.json` do artefato e a base `/`.

Rollback é uma operação explícita. Use o mecanismo de rollback da Vercel somente
se disponível e autorizado na conta, registrando deployment e motivo. A opção
reproduzível é um revert revisado por MR, novo pipeline verde e publicação manual.
Não execute casualmente um deploy de pipeline antigo. Não se presume recurso
pago nem disponibilidade de rollback instantâneo no plano atual.

## Referências

- [Build Output API](https://vercel.com/docs/build-output-api)
- [Configuração de rotas](https://vercel.com/docs/build-output-api/configuration)
- [Primitivas estáticas](https://vercel.com/docs/build-output-api/primitives)
- [Vercel CLI deploy](https://vercel.com/docs/cli/deploy)
- [GitLab e Vercel](https://vercel.com/kb/guide/how-can-i-use-gitlab-pipelines-with-vercel)
- [Segurança de deployments GitLab](https://docs.gitlab.com/ci/environments/deployment_safety/)

## Fonte visual no build

O build começa por `pnpm tokens:check` (sem geração prévia), depois typecheck e
Vite. Alterações em `docs/design-system/**/*` e `.dockerignore` acionam os mesmos
jobs frontend, inclusive elegibilidade do deploy manual; não acionam backend.
A saída CSS é versionada e deve corresponder aos tokens do mesmo commit. O
catálogo de desenvolvimento não integra o módulo de produção; sua URL mostra
não encontrado via fallback SPA. Empacotamento prebuilt e rastreabilidade seguem
inalterados. Consulte o [design system](design-system/README.md).

Compose usa contexto raiz com `frontend/Dockerfile`, recebendo tokens e declaração
ESM de docs/design-system; os COPY e `.dockerignore` da raiz restringem entradas.
Comando isolado, na raiz:

```bash
docker build -f frontend/Dockerfile --build-arg VITE_API_URL=https://api.example.com \
  --tag urban-reports-frontend:local .
```

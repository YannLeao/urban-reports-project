# Desenvolvimento frontend

O projeto independente em `frontend/` usa React/TypeScript/Vite. Não existe
workspace pnpm nem package.json na raiz; o backend continua com Maven.

## Ambiente e instalação

Use Node **22.23.2**, registrado em `frontend/.node-version`, e pnpm **10.34.5**,
fixado em `frontend/package.json#packageManager`. CI e build Docker usam esse
mesmo patch Node. Ative-o com seu gerenciador de Node e confira `node --version`.
O engine restringe Node à linha 22, a partir desse patch.

Corepack não é pré-requisito. Para bootstrap isolado, com Node ativo, execute
em `frontend/` (a pasta temporária pode ser descartada ao fim da sessão):

```bash
FRONTEND_TOOLS_DIR=$(mktemp -d)
npm install --prefix "$FRONTEND_TOOLS_DIR" --no-audit --no-fund pnpm@10.34.5
export PATH="$FRONTEND_TOOLS_DIR/node_modules/.bin:$PATH"
pnpm --version
pnpm install --frozen-lockfile
```

Como alternativa, se desejar uma instalação global na sua máquina, use
`npm install --global pnpm@10.34.5`. npm é usado apenas no bootstrap; comandos
e dependências do aplicativo são geridos por pnpm. Não use `pnpm@latest` no CI.
O bootstrap CI/Docker lê a versão exata de `packageManager`.

Os scripts de build, empacotamento, deploy e seus testes em `scripts/` usam
TypeScript strict. `tsconfig.scripts.json` integra `tsc -b` (typecheck e build),
usa `NodeNext`, tipos Node 22 e `erasableSyntaxOnly`. ESLint também aplica regras
com informação de tipos aos scripts. Dados JSON externos entram como `unknown`
e são validados com Zod antes de uso.

O Node 22.23.2 executa esses `.ts` diretamente por remoção de tipos, sem `tsx`
ou compilação intermediária. Essa execução **não verifica tipos** nem interpreta
`tsconfig`: mantenha `pnpm run typecheck` no fluxo. Imports locais usam extensão
`.ts`; enums, parameter properties e aliases de paths não são usados.
Consulte o [suporte TypeScript do Node 22](https://nodejs.org/docs/latest-v22.x/api/typescript.html).

`pnpm-lock.yaml` é o único lockfile do frontend. Instale com `--frozen-lockfile` para reproduzir a
resolução; mudanças deliberadas de dependências devem atualizar esse arquivo.
A permissão `pnpm.onlyBuiltDependencies` autoriza apenas o postinstall do
esbuild, que verifica/prepara o binário usado pelo Vite. Não libere todos os
scripts de instalação. Downloads exigem rede quando não estiverem em cache.

## Comandos

Execute em `frontend/`, com o Node/pnpm acima e dependências instaladas:

| Comando | Finalidade |
| --- | --- |
| `pnpm run dev` | Vite local; normalmente http://localhost:5173 |
| `pnpm run lint` | ESLint |
| `pnpm run typecheck` | TypeScript strict com `tsc -b` |
| `pnpm test` | Testes finitos: Node dos scripts de CI/deploy, depois Vitest |
| `pnpm run build` | `tokens:check`, `tsc -b` e `vite build`, gerando `dist/` |
| `pnpm run preview` | Servir o bundle local após build |

## Configuração e consulta

Copie `.env.example` para `.env` e configure `VITE_API_URL`. A URL é pública e
incorporada no build, nunca deve conter segredos e exige recompilação se mudar.
O exemplo local usa `http://localhost:8080`. Para health real, inicie o backend
com seu PostgreSQL/configuração; os testes frontend não exigem nenhum serviço.

`src/lib/api.ts` valida a base com Zod no momento da consulta, aceita HTTP/HTTPS
sem credenciais, query string ou fragmento e rejeita API HTTP em página HTTPS.
Remove barras finais sem remover o path: `https://host/base/` resulta em
`https://host/base/api/health`. Configuração ausente ou inválida aparece na
página de status; não impede navegar pela entrada ou pelo não encontrado.

O helper usa fetch nativo, propaga AbortSignal e apresenta mensagens públicas
para erros de rede, HTTP, JSON e configuração, sem expor valores técnicos. `useHealth` valida `{ "status": "UP" }`, conforme o
controller atual; payload 2xx incompatível é erro. O tipo resulta do schema.
Uma mudança no contrato backend requer atualizar schema e testes juntos.

A query usa chave `['health']`, sem retries automáticos, polling ou refetch por
foco/reconexão. Ao entrar novamente em status, dados são considerados antigos
(`staleTime: 0`) e a consulta é refeita. Há carregamento, sucesso, erro e ação
manual de tentar novamente; sair da página cancela a requisição em andamento.

## Organização e rotas

- `src/app/providers.tsx`: QueryClient estável por montagem da aplicação.
- `src/app/routes.tsx`: configuração declarativa central de rotas.
- `src/pages/`: HomePage, StatusPage, ImageProofPage e NotFoundPage.
- `src/features/image/`: seleção controlada, validação e prévia local de imagem.
- `src/features/identity/`: validação e chamada de cadastro sem cache/retry; `/cadastro` compõe o formulário público.
- `src/features/health/`: consulta validada e apresentação de health.
- `src/lib/api.ts`: base da API e leitura de JSON por fetch.
- `src/main.tsx`: composição de providers e BrowserRouter; `App.tsx`: shell.
- `src/app/App.test.tsx` e `src/test/setup.ts`: testes de comportamento e setup.

`/prova-imagem` é uma demonstração pública transitória, sem upload ou dependência
de API; veja [contrato, validações e roteiro](image-selection-proof.md).

`/` é a entrada, `/status` contém a verificação da API e caminhos desconhecidos
oferecem retorno ao início. Links usam React Router, em modo declarativo,
sem SSR, loaders, autenticação ou rotas vazias de negócio.

A identidade e os componentes seguem o [design system Alô Cidade](design-system/README.md).
Leia-o antes de criar UI. Tokens canônicos em `docs/design-system/tokens.ts` geram
CSS versionado com `pnpm tokens:generate`; `pnpm tokens:check` compara sem modificar.
Tailwind 4 usa `@theme inline` gerado para os tokens semânticos. Priorize
utilitários em páginas/componentes; CSS manual fica nos defaults globais e nas
integrações justificadas conforme o design system. Atualize
código e documentação juntos. Manrope é local, pesos 400/700, com licença pública.
A referência `/dev/design-system` existe somente em `pnpm dev`, sem navegação
pública; em produção, mostra não encontrado e seu módulo não é incluído.
O TypeScript das ferramentas também verifica os tokens externos. O package.json
em docs/design-system declara somente ESM, sem criar workspace.

## Testes e CI

Vitest, React Testing Library, user-event, jest-dom e jsdom exercitam navegação,
consulta real entre Query/fetch/schema, erros, recuperação e cancelamento.
Cada caso usa QueryClient novo e fetch controlado, sem credenciais ou API real.
O Vitest descobre somente `src/**/*.test.{ts,tsx}`; a suíte `node:test` em
`scripts/*.test.ts` roda separadamente no mesmo `pnpm test`. Falha em
qualquer suíte devolve saída não zero. Não há E2E ou meta de cobertura.

O job `frontend:build` compila pelo script de CI; `frontend:lint` executa lint,
typecheck e ambas as suítes. O build também preserva sua checagem TypeScript.
Ambos instalam com frozen lockfile e cacheiam apenas `.pnpm-store/`, com chave
baseada no lockfile. Cache vazio deve funcionar. Mudanças em `frontend/`,
`docs/design-system/`, `.dockerignore`, `docker-compose.yml`, `.gitlab-ci.yml`
ou `infrastructure/gitlab-ci/frontend.yml` acionam as verificações frontend.
Consulte [deploy frontend](frontend-deployment.md) para a tradução de variáveis
e os requisitos adicionais do build de produção.

## Docker e limites de hospedagem

Para verificar apenas o frontend, na raiz, sem iniciar banco/backend:

```bash
docker build --build-arg VITE_API_URL=https://api.example.com \
  --file frontend/Dockerfile --tag urban-reports-frontend:local .
docker run --rm --publish 127.0.0.1:5173:80 urban-reports-frontend:local
```

Abra `/`, `/status` diretamente e atualize a página; confira os assets no
navegador. A URL de exemplo não comprova integração: configure uma API acessível
com CORS adequado para essa prova. O Nginx existente aplica fallback para
`index.html`. `docker compose config --quiet` apenas valida a configuração;
não atesta serviços operacionais. Nenhum volume precisa ser removido.

O CI usa base `/` e empacota `dist` para Vercel com
`node scripts/package-vercel.ts`. O pacote inclui regras SPA e 404 para assets
ausentes; o deploy manual publica esse artefato após as verificações. `.vercel/`
é gerado e ignorado pelo Git/Docker. Os testes Node cobrem build, empacotamento,
roteamento declarado e rejeição de artefatos de outro pipeline. Confira o
[guia de deploy](frontend-deployment.md) para variáveis e validação pública.
Nginx local não comprova o roteamento da Vercel.

Compose recebe `FRONTEND_ALLOWED_ORIGINS` para o backend e `VITE_API_URL` como
build arg frontend. Variáveis vêm do shell, `.env` da raiz ou `--env-file`, não
automaticamente dos `.env` de cada aplicação. No celular, localhost aponta ao
próprio dispositivo; use a API acessível e reconstrua o bundle.

A base usa a identidade Alô Cidade e oferece [cadastro real](identity.md) em
`/cadastro`, sem autenticação automática. O helper `postJson` no cliente existente
omite credenciais; o formulário mantém senhas apenas no estado local e as limpa
após tentativa HTTP. Erros por código e confirmação 201 são validados com Zod.
Valide alterações de produção pelo [roteiro de deploy](frontend-deployment.md);
a inspeção local não substitui a verificação da versão publicada.

Referências: [pnpm](https://pnpm.io/installation),
[importação de lockfile](https://pnpm.io/cli/import),
[Router declarativo](https://reactrouter.com/start/declarative/installation),
[Query](https://tanstack.com/query/latest/docs/framework/react/overview),
[Zod](https://zod.dev/),
[Tailwind 4 com Vite](https://tailwindcss.com/docs/installation/using-vite) e
[Vitest 3](https://v3.vitest.dev/guide/).

O Dockerfile frontend exige contexto da **raiz** para copiar tokens e a
declaração ESM de docs/design-system. Usa COPY restritos e `.dockerignore` da raiz.
Não copiar `.env`, dependências locais ou docs desnecessários. `tokens:check` também roda dentro da imagem.
Para contrastes reproduzíveis: `node scripts/contrast.ts` em frontend/.

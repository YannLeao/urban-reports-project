# Deploy público do frontend no GitLab Pages

## Fluxo de publicação

```text
frontend:build → frontend:lint → frontend:pages
     ↓                              ↑
frontend/dist/ ── mesmo artefato ─────┘
```

O CI instala as dependências, testa a configuração do build e executa TypeScript
e Vite. O job `frontend:pages` depende de build e lint aprovados, recebe
`frontend/dist/` como artefato e publica esse diretório sem recompilar.

O Pages é publicado automaticamente apenas na branch padrão, quando há mudanças
em `frontend/` ou `.gitlab-ci.yml`. Merge Requests validam build e lint, mas não
publicam. Backend e frontend mantêm dependências separadas: o deploy manual do
backend não bloqueia o Pages.

## URL do backend no build

Em **Settings > CI/CD > Variables**, configure:

| Variável | Valor | Environment scope |
|---|---|---|
| `BACKEND_PRODUCTION_URL` | URL HTTPS pública da API, por exemplo `https://api.exemplo.com` | `*` |

Essa variável não é segredo. Se for **Protected**, a branch padrão deve estar
protegida para recebê-la. O scope precisa incluir o job de build, que não declara
um environment; deixá-lo somente em `production` impede sua entrega ao build.
Não é necessário cadastrar outra variável `VITE_API_URL` no GitLab.

`frontend/scripts/build-ci.mjs` converte `BACKEND_PRODUCTION_URL` em
`VITE_API_URL` antes de executar o Vite. Na branch padrão, o build falha se a
variável estiver ausente, vazia, inválida ou sem HTTPS. URLs com credenciais,
query string ou fragmento também são rejeitadas. Assim, o build não publica
silenciosamente um bundle apontando para localhost.

Nas MRs e branches de validação, variáveis protegidas podem estar indisponíveis.
Nesses casos, o build usa `VITE_API_URL`, se fornecida, ou a URL local apenas para
validar a compilação. Esses artefatos não são publicados.

O Vite incorpora a URL aos arquivos estáticos durante o build, não no navegador
nem no job de publicação. Depois de alterar a variável, execute uma nova
pipeline da branch padrão para gerar outro bundle. Nunca coloque segredos em
variáveis `VITE_*`, pois seus valores ficam visíveis ao usuário.

## Caminhos e environment

O build de CI usa `--base=./`, permitindo carregar assets tanto em domínios
exclusivos do Pages quanto em URLs de projeto com subpasta. O link inicial da
aplicação respeita essa base. O build local e a imagem Docker mantêm seus
comandos existentes.

O environment do frontend é `production/frontend`, com URL `$CI_PAGES_URL`,
separado do environment `production` do backend. Nenhum Deploy Hook ou segredo
do Render é necessário no job Pages.

## CORS no Render

No backend, configure `FRONTEND_ALLOWED_ORIGINS` com a **origem** HTTPS pública
do Pages: protocolo e domínio, sem subpasta e sem barra final.

```text
FRONTEND_ALLOWED_ORIGINS=https://seu-frontend.gitlab.io
```

Se o Pages usa um domínio exclusivo, copie o domínio efetivamente exibido em
**Deploy > Pages**. É possível permitir várias origens separando-as por vírgula.
Não use `*` para liberar qualquer site.

Sem essa variável, o backend permite apenas `http://localhost:5173`, preservando
o desenvolvimento local. Publique o backend com a nova configuração após a
alteração. Uma URL correta no bundle não elimina um bloqueio CORS.

## Validar

Localmente, em `frontend/`:

```bash
node --test scripts/build-ci.test.mjs
npm run lint
CI_DEFAULT_BRANCH=main CI_COMMIT_BRANCH=main \
  BACKEND_PRODUCTION_URL=https://api.exemplo.com node scripts/build-ci.mjs
```

Depois do merge:

1. Confirme `frontend:build`, `frontend:lint` e `frontend:pages` verdes.
2. Abra o endereço de **Deploy > Pages** e confirme que os assets carregam.
3. Na aba Network do navegador, verifique que `/api/health` é solicitado à URL
   HTTPS do backend e não a localhost.
4. Confirme o retorno HTTP 200, o header `Access-Control-Allow-Origin` para a
   origem do Pages e o estado “API operacional” na tela.

Se o build reclamar de variável ausente, revise valor, scope e proteção. Se a
requisição usar a URL correta, mas falhar por CORS, revise a variável no Render.
O Pages não utiliza o Nginx da imagem Docker; HTTPS é fornecido pelo GitLab Pages.

Referências: [variáveis do Vite](https://vite.dev/guide/env-and-mode) e
[configuração CI/CD do GitLab](https://docs.gitlab.com/ci/yaml/).

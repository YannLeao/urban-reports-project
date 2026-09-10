# Deploy público do frontend

O frontend usa a variável `VITE_API_URL`, que é incorporada aos arquivos
estáticos durante `npm run build`. Em produção, configure-a com a origem HTTPS
completa da API, sem barra no final:

```text
VITE_API_URL=https://api.exemplo.com
```

Não coloque segredos nessa variável: valores `VITE_*` ficam visíveis no bundle
do navegador. O backend deve configurar CORS para permitir apenas a origem
HTTPS do frontend.

## GitLab CI/CD

Cadastre `VITE_API_URL` em **Settings > CI/CD > Variables** como variável de
ambiente protegida. O job deve exportá-la antes do build:

```yaml
frontend-build:
  image: node:22-alpine
  stage: build
  variables:
    VITE_API_URL: $VITE_API_URL
  script:
    - cd frontend
    - npm ci
    - npm run build
  artifacts:
    paths:
      - frontend/dist/
```

Para a imagem Docker, passe a variável como argumento no estágio de build, caso
o Dockerfile venha a precisar dela diretamente:

```yaml
- docker build --build-arg VITE_API_URL="$VITE_API_URL" -t "$CI_REGISTRY_IMAGE/frontend:$CI_COMMIT_SHA" frontend
```

## Vercel e Netlify

Crie uma variável de ambiente chamada `VITE_API_URL` no painel do projeto,
defina o valor HTTPS da API e aplique-a ao ambiente de produção. Use:

```text
Build command: npm run build
Output directory: dist
Root directory: frontend
```

Depois de alterar a variável, faça um novo deploy: o Vite injeta os valores
somente durante o build.

## HTTPS e conteúdo misto

O Nginx do container redireciona requisições que chegam com
`X-Forwarded-Proto: http` para HTTPS. O certificado TLS deve ser terminado no
load balancer, ingress ou CDN. Além disso, o frontend falha explicitamente se
for servido por HTTPS e receber uma `VITE_API_URL` iniciada por `http://`,
evitando uma chamada bloqueada pelo navegador.
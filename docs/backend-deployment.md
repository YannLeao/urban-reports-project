# Deploy do backend

Este documento descreve o fluxo de publicação do backend no Render coordenado
pelo GitLab CI/CD. O frontend não é publicado por esta esteira.

## Visão do fluxo

```text
commit na branch padrão
        ↓
backend:build + backend:test
        ↓
backend:deploy (ação manual)
        ↓
Render Deploy Hook com o SHA testado
        ↓
Render constrói backend/Dockerfile
        ↓
Spring Boot conecta ao Neon e executa Flyway
        ↓
/api/health confirma a inicialização
```

O Auto-Deploy do serviço no Render deve permanecer em `Off`. Caso contrário, o
Render pode publicar um commit antes da autorização do GitLab ou duplicar o
deployment solicitado pelo hook.

## Comportamento do pipeline

Os jobs existentes foram preservados:

| Caminho alterado | Jobs executados |
|---|---|
| `backend/**/*` | `backend:build`, `backend:test` |
| `frontend/**/*` | `frontend:build`, `frontend:lint` |
| `.gitlab-ci.yml` | todos os jobs de build e teste |

Os testes do backend continuam usando Docker-in-Docker para o PostgreSQL do
Testcontainers e publicando os relatórios JUnit. O repositório Maven foi
direcionado a `backend/.m2/repository`, tornando efetivo o caminho armazenado no
cache do GitLab.

Merge Requests continuam recebendo pipeline. Quando uma MR está aberta, o
pipeline de push redundante da mesma branch é descartado por
`CI_OPEN_MERGE_REQUESTS`. Branches sem MR continuam recebendo pipeline normal.

O deploy aparece apenas quando todas as condições são verdadeiras:

- pipeline da branch padrão;
- alteração em `backend/**/*` ou `.gitlab-ci.yml`;
- `backend:build` e `backend:test` concluídos com sucesso;
- acionamento manual por uma pessoa autorizada.

Uma mudança exclusiva de frontend ou documentação não disponibiliza deploy do
backend.

## Variáveis do GitLab

Cadastre em **Settings > CI/CD > Variables**:

| Variável | Proteção | Finalidade |
|---|---|---|
| `RENDER_DEPLOY_HOOK` | Protected, Masked e Hidden quando disponível | URL secreta do Deploy Hook |
| `BACKEND_PRODUCTION_URL` | pode ser visível | URL HTTPS pública do backend |

O hook nunca deve ser copiado para o YAML, documentação, issue ou log. A branch
padrão também deve permanecer protegida conforme a política da equipe; isso
permite que uma variável `Protected` seja entregue somente a refs autorizadas.

Credenciais `DB_URL`, `DB_USERNAME`, `DB_PASSWORD` e todas as
`IMAGE_STORAGE_*` pertencem às variáveis do serviço no Render. Não as duplique
no GitLab, porque o job de deploy só chama o hook.

## Configuração esperada no Render

- Runtime: `Docker`.
- Branch: branch padrão do projeto.
- Dockerfile: `backend/Dockerfile`.
- Docker context/root directory: `backend` conforme a configuração do serviço.
- Auto-Deploy: `Off`.
- Health Check Path: `/api/health`.

O backend aceita uma JDBC URL completa por `DB_URL`, incluindo os parâmetros de
TLS exigidos pelo Neon. Quando `DB_URL` não é definida, permanece disponível o
fallback por `DB_HOST`, `DB_PORT` e `DB_NAME` para ambientes locais. O Flyway é
executado pelo Spring Boot durante cada inicialização e aplica somente migrations
pendentes; não existe job de migration no GitLab.

## Publicar e validar

Depois do merge de uma alteração de backend:

1. Abra o pipeline da branch padrão e confirme `backend:build` e
   `backend:test` verdes.
2. Acione manualmente `backend:deploy`.
3. Confirme que o job terminou com sucesso e que o GitLab registrou o deployment
   no environment `production` com a URL correta.
4. Acompanhe no Render o build do commit exibido em `$CI_COMMIT_SHA`.
5. Aguarde o health check do Render e valide:

```bash
curl --fail --show-error --silent "$BACKEND_PRODUCTION_URL/api/health"
curl --fail --show-error --silent "$BACKEND_PRODUCTION_URL/v3/api-docs"
```

Abra também `$BACKEND_PRODUCTION_URL/swagger`. Nos logs do Render, confirme que
o Flyway validou o histórico ou aplicou apenas migrations novas e que a conexão
utiliza o Neon.

Para comprovar o R2, faça upload e recuperação de uma imagem pelos endpoints
técnicos já documentados. Um redeploy com as mesmas variáveis deve continuar
recuperando o objeto e os dados no Neon, pois ambos são externos ao container.

## Redeploy e limitações

Para repetir uma publicação do mesmo commit, execute novamente o job manual se
o GitLab permitir o retry, ou inicie um novo pipeline da branch padrão. O job
confirma que o Render aceitou o hook; ele não faz polling até o término do build.
O status definitivo, logs e eventuais limitações de inicialização do plano usado
devem ser acompanhados no Render.

Falhas HTTP e de conexão no hook falham imediatamente o job por meio de
`curl --fail --show-error --silent`. Se o hook for regenerado, atualize somente
a variável protegida no GitLab.

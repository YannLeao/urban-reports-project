# ADR 0004: Centralizar o deploy do backend no GitLab CI/CD

- Status: aceito
- Data: 2026-09-09

## Contexto

O backend já possui imagem Docker, testes automatizados, PostgreSQL Neon e
armazenamento Cloudflare R2. O Render foi validado manualmente como runtime, mas
seu Auto-Deploy dispararia uma publicação sem que o GitLab tivesse autorizado o
commit após os testes. Em um monorepositório, executar backend e frontend em
toda alteração também aumenta o tempo e o consumo do pipeline sem melhorar a
confiança.

## Decisão

- Usar o GitLab como centro do fluxo de CI/CD.
- Manter no Render o runtime Docker do backend e o Auto-Deploy desligado.
- Manter o Neon como PostgreSQL externo e o R2 como storage privado, com suas
  credenciais configuradas somente no runtime do Render.
- Executar jobs de backend e frontend seletivamente conforme os caminhos
  alterados, sem remover os jobs existentes.
- Evitar pipelines redundantes de branch quando houver uma Merge Request aberta,
  priorizando o pipeline da MR.
- Disponibilizar `backend:deploy` somente na branch padrão, após os jobs de
  backend, como ação manual.
- Disparar o Deploy Hook secreto do Render com `ref=$CI_COMMIT_SHA`, garantindo
  que o commit solicitado seja o mesmo validado pelo GitLab.
- Registrar o deployment no environment `production`, associado à URL pública
  configurada no GitLab.
- Manter o Flyway no startup da aplicação: o GitLab não executa migrations
  separadamente.

## Consequências

- Um deploy de produção passa a exigir CI de backend verde e uma decisão humana.
- Falhas exclusivas do frontend não bloqueiam um pipeline que alterou somente o
  backend, pois os jobs usam dependências específicas por serviço.
- O Deploy Hook precisa permanecer protegido, mascarado e oculto no GitLab.
- O GitLab registra o histórico de deployments, mas o job apenas confirma que o
  Render aceitou a solicitação; o Render continua responsável por build,
  inicialização e health check.
- O uso do SHA exato evita publicar por engano um commit posterior da branch.
- O deploy poderá se tornar automático no futuro alterando apenas a regra do
  job, quando a equipe considerar o fluxo suficientemente maduro.

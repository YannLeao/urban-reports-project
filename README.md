# Plataforma de Ocorrências Urbanas

Aplicação web acadêmica, responsiva e *mobile-first*, para registrar, consultar,
moderar e acompanhar problemas urbanos. O projeto é desenvolvido na disciplina
Projeto Interdisciplinar de Engenharia da Computação 4.

## Visão geral

O sistema terá um frontend React separado de um backend Spring Boot. A
comunicação será feita por API REST, com PostgreSQL como banco de dados e Flyway
para controlar as migrações. O ambiente completo será executado com Docker
Compose e validado pelo GitLab CI/CD.

Nesta primeira etapa, o repositório contém a fundação do monorepositório e um
backend mínimo conectado ao PostgreSQL, com schema versionado pelo Flyway. O
backend também contém uma prova técnica de armazenamento privado de imagens no
Cloudflare R2. Os demais serviços e comandos passam a funcionar à medida que os
respectivos cards da Sprint 1 forem integrados.

## Estrutura do repositório

```text
.
├── backend/                  # API Spring Boot
├── frontend/                 # Aplicação web React
├── docs/
│   └── adr/                  # Registros de decisões arquiteturais
├── infrastructure/
│   ├── docker/               # Arquivos auxiliares de containers
│   └── gitlab-ci/            # Componentes reutilizáveis do pipeline
├── .gitlab/                  # Templates de issues e Merge Requests
├── compose.yaml              # Conteinerização do projeto
├── .gitlab-ci.yml            # CI/CD do projeto
└── README.md
```

## Pré-requisitos

- Git;
- Java 21;
- Docker com Docker Compose;
- Node.js em versão LTS;
- gerenciador de pacotes definido pelo projeto frontend.

O Docker também é necessário para os testes de integração do backend, que criam
um PostgreSQL descartável por meio do Testcontainers.

## Configuração local

Cada aplicação mantém seu próprio exemplo de configuração. Crie os arquivos
locais a partir deles:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Os arquivos `.env` são ignorados pelo Git. Os valores dos exemplos servem apenas
para desenvolvimento local e não devem ser reutilizados em ambientes públicos.

O backend lê opcionalmente `backend/.env` e utiliza as seguintes variáveis:

| Variável | Finalidade | Exemplo local |
|---|---|---|
| `DB_HOST` | Host do PostgreSQL | `localhost` |
| `DB_PORT` | Porta do PostgreSQL | `5432` |
| `DB_NAME` | Nome do banco | `urban_reports` |
| `DB_USERNAME` | Usuário do banco | `urban_reports` |
| `DB_PASSWORD` | Senha do banco | `local_development_only` |
| `DB_URL` | JDBC URL completa; substitui host, porta e nome quando definida | não definida |
| `BACKEND_PORT` | Porta HTTP do backend | `8080` |
| `IMAGE_STORAGE_ENDPOINT` | Endpoint S3-compatible da conta R2 | `https://...r2.cloudflarestorage.com` |
| `IMAGE_STORAGE_REGION` | Região exigida pelo cliente S3 | `auto` |
| `IMAGE_STORAGE_BUCKET` | Bucket privado da prova | `urban-reports-development` |
| `IMAGE_STORAGE_ACCESS_KEY` | Chave de acesso restrita ao bucket | valor local secreto |
| `IMAGE_STORAGE_SECRET_KEY` | Segredo da chave de acesso | valor local secreto |

As cinco variáveis de storage ativam a integração. Sem
`IMAGE_STORAGE_ENDPOINT`, o backend continua disponível para health check e as
demais funções, mas operações de imagem respondem como storage indisponível.
Nunca utilize credenciais reais no `.env.example` ou em commits.

Mantenha `DB_URL` ausente quando desejar o fallback local por host, porta e nome.
No Render, defina-a com a URL JDBC completa fornecida pelo Neon.

### PostgreSQL local

Enquanto o Docker Compose do projeto ainda não estiver disponível, um banco de
desenvolvimento pode ser iniciado diretamente:

```bash
docker run --name urban-reports-postgres \
  --env POSTGRES_DB=urban_reports \
  --env POSTGRES_USER=urban_reports \
  --env POSTGRES_PASSWORD=local_development_only \
  --publish 5432:5432 \
  --detach postgres:17-alpine
```

O banco pode ser interrompido e retomado sem perder os dados:

```bash
docker stop urban-reports-postgres
docker start urban-reports-postgres
```

## Comandos de desenvolvimento

Os comandos abaixo representam o fluxo acordado e serão habilitados pelos cards
correspondentes da Sprint 1:

```bash
# Backend
cd backend
./mvnw spring-boot:run

# Testes do backend
./mvnw test

# Frontend (após a inicialização do React)
cd frontend
npm install
npm run dev

# Ambiente completo (após a criação do Compose)
docker compose up --build
```

Com o backend em execução, os recursos iniciais ficam disponíveis em:

- saúde da API: `http://localhost:8080/api/health`;
- Swagger UI: `http://localhost:8080/swagger`;
- especificação OpenAPI: `http://localhost:8080/v3/api-docs`.

A prova técnica recebe uma imagem JPEG, PNG ou WebP de até 5 MB em
`POST /api/storage/images` (campo multipart `file`) e a recupera em
`GET /api/storage/images/{id}`. O bucket não é público: os bytes sempre passam
pelo backend. Esse contrato é temporário e não representa a futura criação de
ocorrências. O roteiro completo está em
[`docs/image-storage.md`](docs/image-storage.md).

Na primeira inicialização contra um banco vazio, o Flyway aplica automaticamente
as migrations em `backend/src/main/resources/db/migration`. Nas inicializações
seguintes, ele valida o histórico e executa somente migrations ainda não
aplicadas. O Hibernate está configurado apenas para validar o schema, nunca para
criá-lo ou modificá-lo.

Para recriar o banco local de desenvolvimento, remova o container — essa ação
apaga todos os seus dados — e execute novamente o comando de criação:

```bash
docker rm --force urban-reports-postgres
```

Os testes não dependem desse container: com o Docker ativo, o Testcontainers cria
e remove instâncias isoladas de PostgreSQL automaticamente.

## Imagem Docker do backend

O Dockerfile multi-stage gera o JAR com Java 21 e o Maven Wrapper no estágio de
build. A imagem final utiliza somente o runtime Java 21, contém apenas o JAR
executável e inicia a aplicação como usuário sem privilégios.

Execute os testes antes de construir a imagem:

```bash
cd backend
./mvnw test
cd ..

docker build --tag urban-reports-backend:local ./backend
```

PostgreSQL e Cloudflare R2 permanecem serviços externos. Com um PostgreSQL
acessível pelo container e as configurações locais em `backend/.env`, execute:

```bash
docker run --rm \
  --publish 8080:8080 \
  --add-host host.docker.internal:host-gateway \
  --env-file backend/.env \
  urban-reports-backend:local
```

Dentro de containers, `DB_HOST=localhost` aponta para o próprio container do
backend, não para a máquina host. Para o comando acima, use
`DB_HOST=host.docker.internal`. O futuro Docker Compose definirá os nomes e a
rede dos serviços; esta imagem não embute essas decisões.

A porta padrão exposta é `8080`, mas `BACKEND_PORT` continua configurável em
runtime. Depois da inicialização, valide:

- `http://localhost:8080/api/health`;
- `http://localhost:8080/swagger`;
- `http://localhost:8080/v3/api-docs`.

Credenciais e arquivos `.env` não entram no contexto de build. Toda configuração
de PostgreSQL e R2 é fornecida somente ao executar o container. Quando o código
mudar, reconstrua a imagem; ela não oferece hot reload e não substitui a execução
local pela IDE ou por `./mvnw spring-boot:run`.

## CI/CD e produção

O GitLab CI valida apenas os serviços afetados por cada alteração. Mudanças em
`backend/` executam compile e testes do backend; mudanças em `frontend/`
executam build e lint do frontend. Alterações no próprio `.gitlab-ci.yml`
validam as duas esteiras. Quando existe uma Merge Request aberta, o pipeline de
MR substitui o pipeline redundante da branch.

Depois que uma alteração de backend chega à branch padrão com os jobs verdes, o
job manual `backend:deploy` fica disponível. Ele registra o environment
`production` no GitLab e solicita ao Render o deploy do mesmo commit validado
pelo pipeline. O Auto-Deploy do Render deve permanecer desligado.

O Render constrói `backend/Dockerfile`, conecta ao PostgreSQL externo no Neon
pela variável `DB_URL` e executa o Flyway durante a inicialização do Spring Boot.
As credenciais do Neon e do Cloudflare R2 pertencem ao ambiente do Render, não
ao GitLab CI. Configuração, operação e redeploy estão detalhados em
[`docs/backend-deployment.md`](docs/backend-deployment.md).

## Fluxo de colaboração

Todo trabalho deve partir da `main`, ser associado a uma issue e chegar à branch
principal por Merge Request revisada por ao menos uma pessoa. O padrão de branch
é `<tipo>/<descrição-curta-em-inglês>`, por exemplo:

- `chore/organize-monorepo`;
- `feature/public-reports`;
- `fix/image-validation`;
- `docs/update-local-setup`.

Consulte [CONTRIBUTING.md](CONTRIBUTING.md) para o fluxo completo e os critérios
de conclusão.

## Documentação

- Decisões arquiteturais: [`docs/adr`](docs/adr);
- Convenções e validação de migrations:
  [`docs/database-migrations.md`](docs/database-migrations.md);
- Configuração e prova manual do storage de imagens:
  [`docs/image-storage.md`](docs/image-storage.md);
- Pipeline e deploy do backend:
  [`docs/backend-deployment.md`](docs/backend-deployment.md);
- Requisitos e planejamento oficial: documentos mantidos pela equipe na
  disciplina;
- Histórico de versões: [CHANGELOG.md](CHANGELOG.md).

## Segurança

Segredos, credenciais, tokens e chaves nunca devem ser versionados. No GitLab,
valores de ambientes públicos devem ser cadastrados como variáveis protegidas e,
quando aplicável, mascaradas.

## Equipe

- Emanoel Asaph Leite de Oliveira;
- Mariana Holanda Chacon Santos;
- Yann Keven Jordão Leão.

## Licença

Este projeto está disponível sob a licença MIT. Consulte [LICENSE](LICENSE).

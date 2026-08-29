# Plataforma de Ocorrências Urbanas

Aplicação web acadêmica, responsiva e *mobile-first*, para registrar, consultar,
moderar e acompanhar problemas urbanos. O projeto é desenvolvido na disciplina
Projeto Interdisciplinar de Engenharia da Computação 4.

## Visão geral

O sistema terá um frontend React separado de um backend Spring Boot. A
comunicação será feita por API REST, com PostgreSQL como banco de dados e Flyway
para controlar as migrações. O ambiente completo será executado com Docker
Compose e validado pelo GitLab CI/CD.

Nesta primeira etapa, o repositório contém somente a fundação do monorepositório.
Os serviços e comandos passam a funcionar à medida que os respectivos cards da
Sprint 1 forem integrados.

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

## Pré-requisitos planejados

- Git;
- Java 21;
- Docker com Docker Compose;
- Node.js em versão LTS;
- gerenciador de pacotes definido pelo projeto frontend.

As versões exatas e os comandos de instalação serão registrados junto à
inicialização de cada aplicação.

## Configuração local

Cada aplicação mantém seu próprio exemplo de configuração. Crie os arquivos
locais a partir deles:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Os arquivos `.env` são ignorados pelo Git. Os valores dos exemplos servem apenas
para desenvolvimento local e não devem ser reutilizados em ambientes públicos.

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

# Histórico de alterações

Todas as mudanças relevantes deste projeto serão registradas neste arquivo.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o
projeto pretende adotar [Versionamento Semântico](https://semver.org/lang/pt-BR/)
quando começar a publicar versões.

## [Não lançado]

### Adicionado

- Estrutura inicial do monorepositório.
- Documentação de colaboração e decisões arquiteturais.
- Exemplo de variáveis para o ambiente local.
- Backend Spring Boot inicial com health check e documentação OpenAPI.
- Persistência PostgreSQL com baseline Flyway e testes reais via Testcontainers.
- Prova técnica de imagens com bucket privado Cloudflare R2, validação de formato
  e recuperação mediada pelo backend.
- Imagem Docker multi-stage do backend com Java 21 e execução como usuário
  não-root.
- Pipeline seletivo por serviço e deploy manual do backend no Render, coordenado
  pelo GitLab CI/CD.
- Base frontend com pnpm, TypeScript strict, Router, Query, Zod e testes de UI.
- Design system Alô Cidade com tokens canônicos, Manrope local e componentes.
- Seleção, prévia e captura nativa de imagem em memória, sem upload.
- Instruções de trabalho para contribuidores e agentes.

### Alterado

- Hospedagem frontend na Vercel com artefato prebuilt e deploy manual pelo GitLab.
- Swagger/OpenAPI desabilitados por padrão e em produção, com opt-in em dev.
- UI com utilitários Tailwind e CSS restrito a defaults globais e tokens gerados.
- Jobs CI separados por aplicação; Compose mantido na raiz.
- Guias focados em contratos e operação; evidências de entrega mantidas nas MRs.

### Corrigido

- CORS do backend configurável para permitir a origem pública do frontend.

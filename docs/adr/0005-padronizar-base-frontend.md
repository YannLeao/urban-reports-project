# ADR 0005: Padronizar a base frontend

- Status: aceito
- Data: 2026-09-22

## Contexto

O frontend React/TypeScript/Vite precisa de navegação, validação nas fronteiras
e testes para crescer além da tela de health. npm e versões divergentes de Node
em CI/Docker dificultam reproduzir o ambiente. A base deve continuar pequena,
sem antecipar domínio, autenticação, design system ou migração de hospedagem.

## Decisão

- Manter `frontend/` independente, com Node 22 no mesmo patch em desenvolvimento,
  CI e Docker, definido em `.node-version`. Usar pnpm 10 fixado em
  `packageManager`, um único lockfile e instalação com `--frozen-lockfile`.
- Usar React Router declarativo com BrowserRouter para rotas centralizadas,
  mantendo a responsabilidade de fallback no servidor de hospedagem.
- Usar TanStack Query para estado de servidor, com QueryClient estável, fetch
  nativo e cancelamento. Definir retry/refetch por necessidade da consulta.
- Usar Zod para validar configuração e payload na fronteira da API; casts
  TypeScript não substituem validação de dados recebidos.
- Integrar Tailwind 4 pelo plugin Vite como ferramenta de estilos. Preservar o
  CSS existente; tokens, componentes e identidade visual serão outra decisão.
- Executar Vitest/Testing Library com jsdom e preservar a suíte Node do script
  de CI. Fixar versões compatíveis com React 19, TypeScript 5.8 e Vite 6.

## Alternativas

Manter npm/fetch com estado local evitaria ferramentas novas, mas não atenderia
à padronização acordada e repetiria coordenação de consulta e validação nas
próximas telas. Router em modo framework/SSR e loaders acrescentariam outro
modelo de dados sem necessidade. Axios não é necessário para o helper atual.
HashRouter mudaria as URLs para contornar um problema que pertence à hospedagem.

## Consequências

Comandos, CI e Docker passam a compartilhar o lockfile e as ferramentas; novas
dependências e scripts de instalação precisam ser avaliados explicitamente.
O bootstrap pode usar npm para instalar apenas o pnpm exato, sem exigir Corepack.
Versões e instruções operacionais estão no [guia frontend](../frontend-development.md).

A primeira utilização cobre `/`, `/status`, não encontrado e health validado.
Os testes não precisam de API real. Pages e seu artefato continuam como estavam;
acesso direto/refresh público permanece uma obrigação da migração de hospedagem.
Esta decisão não entrega funcionalidades de negócio nem um design system.

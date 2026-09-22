# ADR 0007: Desabilitar documentação da API por padrão

- Status: aceito
- Data: 2026-09-22

## Contexto

Swagger UI e OpenAPI estavam públicos por padrão no backend. A entrega #31
retira essa documentação de produção, preservando a API e o frontend. O projeto
usa springdoc 3.1.0, com Swagger UI 5.32.11, sem Spring Security.

## Decisão

- Definir `springdoc.api-docs.enabled=false` e
  `springdoc.swagger-ui.enabled=false` na base e no perfil `prod`.
- Habilitar ambas somente por opt-in no perfil `dev`, mantendo `/swagger`.
  Desabilitar a URL padrão Petstore para a UI usar a especificação da aplicação.
- Passar `SPRING_PROFILES_ACTIVE` explicitamente pelo Compose, sem perfil padrão.
  Usar `prod` no Render e preservar o deploy GitLab CI → Render do ADR 0004.
- Usar a mesma imagem nos ambientes e revisar overrides administrativos. Perfis
  `dev` e `prod` são alternativas operacionais, não mecanismos de autenticação.
- Retornar 404 somente para `/webjars/swagger-ui/**` quando a UI estiver
  desabilitada. Testes HTTP comprovaram que as flags nativas removem as rotas
  springdoc, mas o handler genérico do Spring Boot ainda serve
  `/webjars/swagger-ui/index.html` com 200. O controller condicional cobre essa
  exposição residual, incluindo caminhos com versão, sem bloquear outros
  recursos estáticos ou adicionar filtros de autenticação.
- Testar configurações reais sem perfil, `dev` e `prod`, com servidor HTTP e
  PostgreSQL descartável; nenhuma flag springdoc é injetada pelos testes.

## Consequências

A documentação local exige ativação deliberada; em uma máquina acessível pela
rede, qualquer pessoa que alcance a aplicação com `dev` pode acessá-la. A API
continua pública conforme seu contrato atual: remover Swagger não implementa
autorização de negócio. Health, CORS e storage permanecem independentes da UI.

O operador ainda pode sobrescrever propriedades por configurações de maior
precedência. A validação após deploy deve comprovar health 200, documentação 404
e funcionamento de `/status` no frontend. Um pipeline local não prova o estado
remoto. Atualizações de springdoc/WebJars exigem revisar rotas e recursos nos
testes e no roteiro operacional.

## Referências

- [Propriedades oficiais do springdoc](https://springdoc.org/properties.html)
- [Deploy backend](../backend-deployment.md)

# Design system Alô Cidade

> A cidade é o conteúdo. A interface deve sair do caminho.

Fonte de verdade da identidade pública, independente de uma prefeitura específica.
A direção é cívica, próxima, simples e confiável, com prioridade mobile e uma ação
principal por contexto. Nome: **Alô Cidade**, com acento e espaço.

- [Fundamentos e acessibilidade](fundamentos.md)
- [Componentes e exemplos](componentes.md)
- [Conteúdo e padrões futuros de produto](produto.md)
- [Contrastes medidos](contrastes.md)
- [Tokens canônicos](tokens.ts) e [decisão de engenharia](../adr/0008-estabelecer-design-system.md)

Implementado: tema claro, Manrope local, tokens, componentes básicos, shell,
entrada, não encontrado, apresentação de health em `/status` e referência visual
em `/dev/design-system` **somente no Vite de desenvolvimento**. O catálogo não
aparece na navegação pública, não envia dados e seu módulo não integra produção.
Mapa, autenticação, relatos, dialogs e bottom sheets são orientações futuras.

## Manutenção

1. Consulte estes guias e os componentes antes de construir uma tela.
2. Edite `tokens.ts`: primitivas são valores; papéis semânticos expressam o uso.
   Prefira um papel existente. Não importe este arquivo no código do navegador.
3. Em `frontend/`, execute `pnpm tokens:generate`, revise o CSS gerado e versione
   ambos os arquivos. Nunca edite `src/styles/tokens.generated.css` manualmente.
4. Execute `pnpm tokens:check`, `pnpm typecheck`, `pnpm lint`, `pnpm test` e
   `pnpm build`. `tokens:check` é somente leitura e falha por ausência/divergência.
5. Se alterar cores, execute `node scripts/contrast.ts` em `frontend/`, atualize
   o relatório e confira os pares efetivamente usados, foco e estados no navegador.
   Atualize documentação, catálogo e testes comportamentais pertinentes juntos.

O gerador importa TypeScript diretamente com Node 22, sem compilador próprio.
`tsconfig.scripts.json` verifica tokens e scripts em strict/NodeNext. O pequeno
`package.json` aqui apenas declara ESM; não é workspace nem possui dependências.
O CSS expõe `--ds-*`; o `@theme inline` gerado oferece utilitários semânticos
Tailwind 4 como `bg-surface-raised`, `text-text-primary`, `bg-brand-default` e
`font-sans`. O espaçamento Tailwind parte de `space.1`. Não copie valores em React
ou Markdown. Cores brutas só pertencem às primitivas e ao SVG fornecido da marca.

O build começa pela checagem, sem geração automática que esconda divergências.
CI observa `docs/design-system/**/*`; Docker usa contexto da raiz, COPY restritos
e `.dockerignore` da raiz. A imagem final contém somente Nginx e saída estática.
Consulte os [comandos frontend](../frontend-development.md).

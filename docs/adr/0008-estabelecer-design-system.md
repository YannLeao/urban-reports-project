# ADR 0008: Estabelecer o design system Alô Cidade

- Status: aceito
- Data: 2026-09-22

## Contexto

As próximas telas precisam compartilhar valores visuais e componentes, com
orientação documentada e execução verificável. A fonte de verdade deve manter tokens em
TypeScript dentro de docs, sem importar documentos no bundle nem duplicar cores.
A base integrada possui ADRs até 0007; esta decisão complementa 0005.

## Decisão

Manter `docs/design-system/tokens.ts` como fonte canônica simples, serializável e
tipada; gerar CSS versionado por script Node 22 em frontend/scripts. O check
compara sem escrever e precede build em desenvolvimento, CI e Docker. TypeScript
strict/NodeNext verifica tokens e scripts; package.json local declara apenas ESM.
Tailwind 4 recebe variáveis semânticas por `@theme inline`, sem config de versão 3.
Componentes React compartilhados consomem CSS; a referência visual usa import
condicional de desenvolvimento e não integra o bundle de produção.

Manrope é auto-hospedada por pacote com licença preservada. Os detalhes visuais e
padrões futuros pertencem ao [design system](../design-system/README.md).

## Alternativas e consequências

CSS manual separado da documentação permitiria divergência silenciosa. Importar
TS de docs no navegador ampliaria a fronteira do Vite; um framework de tokens ou
Storybook acrescentaria complexidade sem necessidade atual.

Docs passa a conter fonte de build: regras frontend observam sua pasta; Docker
usa contexto da raiz com COPY e ignore restritos. O backend mantém seu contexto
e não é acionado por mudanças isoladas nos tokens. O pipeline prebuilt Vercel
continua publicando o artefato do mesmo commit mediante revisão/job manual.
A equipe deve atualizar tokens, CSS gerado, exemplos e documentação em conjunto.

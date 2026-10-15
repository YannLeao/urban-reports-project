# ADR 0020: Consolidar a direção visual Alô Cidade

- Status: aceito
- Data: 2026-10-15
- Complementa: [0008](0008-estabelecer-design-system.md)

## Contexto

A referência de design adotada usa Figtree e creme/pêssego/carvão, enquanto a
base inicial documentada no ADR 0008 usava Manrope. A consolidação precisa
preservar a fonte única dos tokens, os componentes e os contratos implementados.

## Decisão

Adotar Figtree local e a paleta da referência, com ajustes mínimos de contraste,
conforme os [fundamentos](../design-system/fundamentos.md). Manter tokens em
TypeScript, CSS gerado, Tailwind e a estrutura de componentes do ADR 0008.
Preservar a geometria do favicon e dos pinos de categoria existentes.

Manter um único HTML de apresentação autocontido em docs/design-system/preview.html.
O comando de tokens sincroniza e verifica seus blocos de cores, fontes locais e
snapshots dos pinos React; layouts e interações demonstrativas continuam editáveis.
O preview é direção de design; código e guias funcionais definem disponibilidade.

## Consequências

Atualizações de fonte, tokens ou pinos exigem regenerar o CSS e o preview. O HTML
inclui fontes e pinos para abertura direta sem rede. A geração usa Vite/React já
presentes no projeto, sem servidor de desenvolvimento ou dependência nova para
renderização. O Docker verifica o documento somente no estágio de build.

A auditoria de páginas reais e a priorização de mapa administrativo, vídeo,
exportação e prioridade permanecem separadas desta consolidação.

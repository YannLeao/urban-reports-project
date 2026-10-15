# Fundamentos e acessibilidade

## Cor e identidade

Os valores finais estão em [tokens.ts](tokens.ts), não nesta documentação.
`primitives` concentra a paleta; `brand`, `surface`, `text`, `border`, `action`
e `feedback` definem os papéis. Creme é o fundo, branco a superfície, areia o
apoio, carvão o texto e a ação principal. Pêssego destaca seleção e áreas de
ênfase; não é texto pequeno sobre creme. Pêssego escuro orienta links. Os quatro
estados têm pares próprios em `report`, sempre acompanhados de rótulo.

Botão principal usa branco sobre carvão; botão de destaque usa carvão sobre
pêssego. Links têm sublinhado; foco usa contorno carvão com offset. Campos e
botões secundários usam `border.control`, mais forte que a borda decorativa.
O texto secundário e o link foram escurecidos ligeiramente em relação à referência
para alcançar 4,5:1 também sobre areia; veja [contrastes](contrastes.md).

O símbolo existente de pino foi preservado e recolorido. A fonte canônica é
[frontend/public/favicon.svg](../../frontend/public/favicon.svg), também usada
no cabeçalho com `alt=""` pois há nome ao lado, e no preview. Fundo carvão, pino
branco e ponto pêssego mantêm leitura nas abas claras/escuras. Para atualizar,
edite somente esse SVG e confira em 16 e 32 px. Não há manifest/PWA ou requisito
existente de apple-touch-icon/ICO; somente a variante SVG é integrada.

## Tipografia, espaço e movimento

Figtree é auto-hospedada via `@fontsource/figtree` 5.2.10, fixada no lockfile.
Pesos reais: 400, 500, 600, 700 e 800, estilo normal, subconjunto latin com
acentos PT-BR. Imports em `frontend/src/index.css` usam WOFF2/WOFF e
`font-display: swap`; Vite empacota os arquivos locais, sem Google Fonts no
navegador. O preview embute os mesmos WOFF2. Autoria: Figtree Project Authors;
licença OFL-1.1 em [figtree-LICENSE.txt](../../frontend/public/figtree-LICENSE.txt).
Fallback: system-ui, -apple-system, Segoe UI, sans-serif conforme o token.

`typography.size` define apoio, corpo, introdução, título e título principal
responsivo; `weight` usa somente os pesos carregados. Corpo tem entrelinha
confortável (`typography.line.body`). `space` é uma escala curta; `layout.reading`
limita leitura e `layout.container` contém o shell. Não fixar altura de texto:
labels, erros e títulos podem crescer. `radius` diferencia controles, cards e
badges; `elevation.card` é discreta. O preview demonstra uma transição tonal suave nos cartões;
a aplicação mantém superfícies sólidas. Sem animações decorativas.
`motion` rege transições curtas, desligadas com `prefers-reduced-motion`.

## Acessibilidade dos elementos entregues

Meta: [WCAG 2.2 AA](https://www.w3.org/Translations/WCAG22-pt-BR/).
Texto normal: 4,5:1; texto grande: 3:1; limites/ícones relevantes: 3:1.
As medições locais não atestam conformidade total do produto. Controles desativados
são isentos do requisito de contraste, mas mantivemos texto legível mesmo assim.

- Alvos interativos têm pelo menos `layout.target` (44 px em tamanho padrão),
  convenção de conforto deste projeto, não o mínimo geral da WCAG AA.
- Use HTML nativo, hierarquia de títulos, link de pular conteúdo e foco visível
  (`action.focus`) sem removê-lo. Não esconder overflow para disfarçar cortes.
- Labels são persistentes; placeholder não os substitui. Descrição e erro são
  associados ao controle, com erro textual e `aria-invalid`.
- Loading tem texto; falhas orientam o próximo passo; badges sempre têm rótulo.
  Alertas urgentes usam `role="alert"`; atualizações comuns usam `role="status"`.
  Evite várias regiões anunciando a mesma mudança.
- Verifique teclado, zoom 200%, 360 px, texto longo, fonte indisponível e movimento
  reduzido. Ícones decorativos ficam fora do nome acessível.
- Tema claro é a única implementação. Não adicionar dark mode automático.

Referência da integração: [Tailwind — theme variables](https://tailwindcss.com/docs/theme).

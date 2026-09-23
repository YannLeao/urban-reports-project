# Fundamentos e acessibilidade

## Cor e identidade

Os valores finais estão em [tokens.ts](tokens.ts), não nesta documentação.
`primitives` concentra a paleta; `brand`, `surface`, `text`, `border`, `action`
e `feedback` definem os papéis. Petróleo sustenta a marca, coral aquece a ação,
superfícies claras dão espaço ao conteúdo. Coral não significa erro e petróleo
não representa o andamento de uma ocorrência.

A ação principal usa texto escuro sobre coral e borda escura: branco sobre coral
não atinge a meta para texto normal, e o preenchimento coral sozinho não basta
para delimitar um controle. A borda de campo (`border.control`) é mais forte que
bordas decorativas (`border.subtle`). Estas últimas não comunicam estado.
Veja o [relatório reproduzível](contrastes.md) para pares, estados e limites.
O favicon fornecido permanece intacto e é reutilizado no cabeçalho com `alt=""`,
pois o nome ao lado já identifica a marca. Não redesenhar o símbolo.

## Tipografia, espaço e movimento

Manrope é auto-hospedada via `@fontsource/manrope` 5.2.8, pacote fixado no lockfile.
Usamos latin, pesos 400 e 700, normal, WOFF2 com fallback WOFF e `font-display:
swap`. Esse subconjunto inclui os acentos PT-BR. Vite empacota os arquivos locais;
não há requisição a Google Fonts no navegador. Origem indicada no pacote:
[Google Fonts](https://github.com/google/fonts/tree/main/ofl/manrope), autoria
[Manrope Project](https://github.com/sharanda/manrope), licença OFL-1.1 preservada
em [public/manrope-LICENSE.txt](../../frontend/public/manrope-LICENSE.txt) e no
pacote instalado. Ao atualizar o pacote, confira também a licença distribuída.
O fallback canônico em `typography.family` usa fontes de sistema sans-serif.

`typography.size` define apoio, corpo, introdução, título e título principal
responsivo; `weight` usa somente os pesos carregados. Corpo tem entrelinha
confortável (`typography.line.body`). `space` é uma escala curta; `layout.reading`
limita leitura e `layout.container` contém o shell. Não fixar altura de texto:
labels, erros e títulos podem crescer. `radius` diferencia controles, cards e
badges; `elevation.card` é discreta. Sem gradientes ou animações decorativas.
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

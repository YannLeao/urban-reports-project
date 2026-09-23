# Contrastes medidos

Gerado dos tokens canônicos com `node scripts/contrast.ts` em `frontend/`.
Fórmula de luminância relativa sRGB e razão WCAG; valores arredondados só na
apresentação. O script falha se um par ficar abaixo da meta. Reexecute ao mudar
cores e atualize este relatório; valores hexadecimais ficam apenas em tokens.ts.
A borda sutil é decorativa; os controles usam border.control ou borda escura.
Os pares disabled também foram medidos, embora isentos do requisito WCAG.

| Par de tokens | Contraste | Meta |
| --- | ---: | ---: |
| text.primary / surface.canvas | 15.25:1 | 4.5:1 |
| text.secondary / surface.canvas | 5.85:1 | 4.5:1 |
| text.link / surface.canvas | 7.20:1 | 4.5:1 |
| border.control / surface.canvas | 3.87:1 | 3:1 |
| focus / surface.canvas | 11.06:1 | 3:1 |
| text.primary / surface.raised | 16.00:1 | 4.5:1 |
| text.secondary / surface.raised | 6.14:1 | 4.5:1 |
| text.link / surface.raised | 7.56:1 | 4.5:1 |
| border.control / surface.raised | 4.06:1 | 3:1 |
| focus / surface.raised | 11.60:1 | 3:1 |
| action.primary.normal | 5.83:1 | 4.5:1 |
| action.primary.hover | 6.70:1 | 4.5:1 |
| action.primary.active | 5.14:1 | 4.5:1 |
| action.primary.disabled | 5.09:1 | 4.5:1 |
| action.primary.loading | 5.83:1 | 4.5:1 |
| action.secondary.normal | 7.56:1 | 4.5:1 |
| action.secondary.hover | 10.05:1 | 4.5:1 |
| action.secondary.active | 8.17:1 | 4.5:1 |
| action.secondary.disabled | 5.09:1 | 4.5:1 |
| action.secondary.loading | 7.56:1 | 4.5:1 |
| action.quiet.normal | 7.20:1 | 4.5:1 |
| action.quiet.hover | 10.05:1 | 4.5:1 |
| action.quiet.active | 8.17:1 | 4.5:1 |
| action.quiet.disabled | 5.09:1 | 4.5:1 |
| action.quiet.loading | 7.20:1 | 4.5:1 |
| feedback.success | 6.40:1 | 4.5:1 |
| feedback.success / raised (ícone/borda/erro) | 7.15:1 | 4.5:1 |
| feedback.warning | 6.55:1 | 4.5:1 |
| feedback.warning / raised (ícone/borda/erro) | 7.12:1 | 4.5:1 |
| feedback.danger | 6.21:1 | 4.5:1 |
| feedback.danger / raised (ícone/borda/erro) | 6.99:1 | 4.5:1 |
| feedback.info | 6.19:1 | 4.5:1 |
| feedback.info / raised (ícone/borda/erro) | 6.96:1 | 4.5:1 |
| marca / raised | 7.56:1 | 4.5:1 |
| borda ação principal / raised | 16.00:1 | 3:1 |

Branco sobre coral: 2.75:1; não usar para texto.

Esses resultados cobrem pares usados nos componentes e referência. Não são uma
certificação de conformidade WCAG do produto inteiro. Foco usa outline separado
por offset sobre as superfícies claras; a ação coral tem borda escura explícita.

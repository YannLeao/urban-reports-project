# Contrastes medidos

Gerado dos tokens canônicos com `node scripts/contrast.ts` em `frontend/`.
Luminância relativa sRGB e razão WCAG; comparação sem arredondar. O script
falha abaixo da meta. Bordas sutis são decorativas; controles usam border.control.
Estados desativados também são medidos, embora isentos do requisito.

| Par de tokens | Contraste | Meta |
| --- | ---: | ---: |
| text.primary / surface.canvas | 12.90:1 | 4.5:1 |
| text.secondary / surface.canvas | 5.14:1 | 4.5:1 |
| text.link / surface.canvas | 5.05:1 | 4.5:1 |
| border.control / surface.canvas | 3.72:1 | 3:1 |
| focus / surface.canvas | 15.26:1 | 3:1 |
| text.primary / surface.raised | 14.55:1 | 4.5:1 |
| text.secondary / surface.raised | 5.80:1 | 4.5:1 |
| text.link / surface.raised | 5.70:1 | 4.5:1 |
| border.control / surface.raised | 4.20:1 | 3:1 |
| focus / surface.raised | 17.21:1 | 3:1 |
| text.primary / surface.soft | 11.88:1 | 4.5:1 |
| text.secondary / surface.soft | 4.74:1 | 4.5:1 |
| text.link / surface.soft | 4.65:1 | 4.5:1 |
| border.control / surface.soft | 3.43:1 | 3:1 |
| focus / surface.soft | 14.06:1 | 3:1 |
| text.primary / surface.tonal | 13.16:1 | 4.5:1 |
| text.secondary / surface.tonal | 5.25:1 | 4.5:1 |
| text.link / surface.tonal | 5.15:1 | 4.5:1 |
| border.control / surface.tonal | 3.80:1 | 3:1 |
| focus / surface.tonal | 15.57:1 | 3:1 |
| action.primary.normal | 14.55:1 | 4.5:1 |
| action.primary.hover | 17.21:1 | 4.5:1 |
| action.primary.active | 9.38:1 | 4.5:1 |
| action.primary.disabled | 4.61:1 | 4.5:1 |
| action.primary.loading | 14.55:1 | 4.5:1 |
| action.secondary.normal | 14.55:1 | 4.5:1 |
| action.secondary.hover | 14.06:1 | 4.5:1 |
| action.secondary.active | 13.20:1 | 4.5:1 |
| action.secondary.disabled | 4.61:1 | 4.5:1 |
| action.secondary.loading | 14.55:1 | 4.5:1 |
| action.quiet.normal | 12.90:1 | 4.5:1 |
| action.quiet.hover | 14.06:1 | 4.5:1 |
| action.quiet.active | 13.20:1 | 4.5:1 |
| action.quiet.disabled | 4.61:1 | 4.5:1 |
| action.quiet.loading | 12.90:1 | 4.5:1 |
| feedback.success | 5.22:1 | 4.5:1 |
| feedback.success / raised (ícone/borda/erro) | 6.48:1 | 4.5:1 |
| feedback.warning | 5.39:1 | 4.5:1 |
| feedback.warning / raised (ícone/borda/erro) | 6.74:1 | 4.5:1 |
| feedback.danger | 5.75:1 | 4.5:1 |
| feedback.danger / raised (ícone/borda/erro) | 7.87:1 | 4.5:1 |
| feedback.info | 7.66:1 | 4.5:1 |
| feedback.info / raised (ícone/borda/erro) | 9.38:1 | 4.5:1 |
| report.pending | 7.46:1 | 4.5:1 |
| report.analysis | 5.39:1 | 4.5:1 |
| report.resolved | 5.22:1 | 4.5:1 |
| report.rejected | 5.75:1 | 4.5:1 |
| destaque pêssego | 7.23:1 | 4.5:1 |
| marca / raised | 14.55:1 | 4.5:1 |
| borda ação principal / raised | 14.55:1 | 3:1 |

Branco sobre pêssego: 2.01:1; não usar para texto.

A referência foi preservada com dois ajustes para superfícies de apoio: secundário
original #6E6A62 → #69655D e link #B24A18 → #AE4616. O primeiro falhava sobre
areia e fundo de desativado; o segundo tinha 4,41:1 sobre areia. Pêssego escuro
original permanece como primitiva. O pêssego claro serve de fundo com texto carvão;
foco usa carvão com offset sobre superfícies claras. Bordas de campo usam
#817B70, pois #E6E1D6 é apenas separador decorativo.

Essas medições cobrem pares centrais; não certificam a acessibilidade do produto
inteiro. Estados também têm rótulos. A aparência exige revisão de teclado, zoom,
layout e conteúdo no navegador.

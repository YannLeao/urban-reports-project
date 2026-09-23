import assert from 'node:assert/strict'
import { tokens } from '../../docs/design-system/tokens.ts'

function luminance(hex: string) {
  const rgb = [1, 3, 5].map(start => {
    const value = parseInt(hex.slice(start, start + 2), 16) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722
}
function contrast(foreground: string, background: string) {
  const a = luminance(foreground), b = luminance(background)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}
const rows: [string, string, string, number][] = []
for (const [surface, background] of Object.entries(tokens.surface)) {
  for (const [text, foreground] of Object.entries(tokens.text)) rows.push([`text.${text} / surface.${surface}`, foreground, background, 4.5])
  rows.push([`border.control / surface.${surface}`, tokens.border.control, background, 3])
  rows.push([`focus / surface.${surface}`, tokens.action.focus.ring, background, 3])
}
for (const variant of ['primary', 'secondary', 'quiet'] as const) {
  for (const [state, pair] of Object.entries(tokens.action[variant])) rows.push([`action.${variant}.${state}`, pair.foreground, pair.background, 4.5])
}
for (const [tone, pair] of Object.entries(tokens.feedback)) {
  rows.push([`feedback.${tone}`, pair.foreground, pair.background, 4.5])
  rows.push([`feedback.${tone} / raised (ícone/borda/erro)`, pair.foreground, tokens.surface.raised, 4.5])
}
rows.push(['marca / raised', tokens.brand.default, tokens.surface.raised, 4.5])
// Primary coral uses a dark boundary: the fill alone is not a 3:1 control boundary.
rows.push(['borda ação principal / raised', tokens.text.primary, tokens.surface.raised, 3])
console.log('| Par de tokens | Contraste | Meta |\n| --- | ---: | ---: |')
for (const [name, foreground, background, minimum] of rows) {
  const ratio = contrast(foreground, background)
  assert.ok(ratio >= minimum, `${name}: ${ratio.toFixed(2)} < ${minimum}`)
  console.log(`| ${name} | ${ratio.toFixed(2)}:1 | ${minimum}:1 |`)
}
console.log(`\nBranco sobre coral: ${contrast(tokens.primitives.white, tokens.brand.accent).toFixed(2)}:1; não usar para texto.`)

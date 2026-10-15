import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

// Embed local assets so the reference also opens via file:// with no CDN or server.
export async function syncPreview(check: boolean, entries: [string, string][],
  path = fileURLToPath(new URL('../../docs/design-system/preview.html', import.meta.url))) {
  const actual = await readFile(path, 'utf8')
  for (const marker of ['/* BEGIN GENERATED PREVIEW */', '/* END GENERATED PREVIEW */', '<!-- BEGIN GENERATED PINS -->', '<!-- END GENERATED PINS -->']) {
    if (!actual.includes(marker)) throw new Error(`Bloco do preview ausente: ${marker}`)
  }
  const fonts = await Promise.all([400, 500, 600, 700, 800].map(async weight => {
    const bytes = await readFile(new URL(`../node_modules/@fontsource/figtree/files/figtree-latin-${weight}-normal.woff2`, import.meta.url))
    return `@font-face{font-family:Figtree;font-style:normal;font-weight:${weight};font-display:swap;src:url(data:font/woff2;base64,${bytes.toString('base64')}) format('woff2')}`
  }))
  const license = await readFile(new URL('../node_modules/@fontsource/figtree/LICENSE', import.meta.url), 'utf8')
  const css = `/* Figtree — ${license} */\n` + ':root{\n' + entries.map(([name, value]) => `--ds-${name}:${value};`).join('\n') + '\n}\n' + fonts.join('\n')
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL('../', import.meta.url)),
    esbuild: { jsx: 'automatic' }, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, watch: null, hmr: false, ws: false }, appType: 'custom' })
  let pins: Record<string, string>
  try {
    // Trusted local source, transformed by Vite just like the application.
    const module = await server.ssrLoadModule('/src/features/location/pins/OccurrencePin.tsx') as {
      OccurrencePin: ComponentType<{ categoryId: number; selected: boolean; size: number }>
    }
    pins = Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].flatMap(categoryId => [false, true].map(selected => [
      `${categoryId}${selected ? '-selected' : ''}`,
      renderToStaticMarkup(createElement(module.OccurrencePin, { categoryId, selected, size: 36 })),
    ])))
  } finally { await server.close() }
  const expected = actual.replace(/\/\* BEGIN GENERATED PREVIEW \*\/[\s\S]*?\/\* END GENERATED PREVIEW \*\//,
    `/* BEGIN GENERATED PREVIEW */\n${css}\n/* END GENERATED PREVIEW */`)
    .replace(/<!-- BEGIN GENERATED PINS -->[\s\S]*?<!-- END GENERATED PINS -->/,
      `<!-- BEGIN GENERATED PINS -->\n<script type="application/json" id="canonical-pins">${JSON.stringify(pins).replaceAll('<', '\\u003c')}</script>\n<!-- END GENERATED PINS -->`)
  if (check) {
    if (actual !== expected) throw new Error('Preview desatualizado. Execute pnpm tokens:generate.')
  } else { await writeFile(path, expected) }
}

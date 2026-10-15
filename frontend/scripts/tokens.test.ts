import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { syncPreview } from './preview.ts'
import { tokens } from '../../docs/design-system/tokens.ts'
import { flatten, syncTokens } from './tokens.ts'

void test('check rejects stale or missing CSS without changing files; generation is deterministic', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'alo-tokens-'))
  const path = join(directory, 'tokens.css')
  try {
    await assert.rejects(syncTokens(true, path), /desatualizados/)
    await syncTokens(false, path)
    const initial = await readFile(path, 'utf8')
    await syncTokens(true, path)
    await syncTokens(false, path)
    assert.equal(await readFile(path, 'utf8'), initial)
    await writeFile(path, 'stale')
    await assert.rejects(syncTokens(true, path), /desatualizados/)
    assert.equal(await readFile(path, 'utf8'), 'stale')
  } finally { await rm(directory, { recursive: true, force: true }) }
})

void test('preview generation preserves editorial content and check rejects stale snapshots without writing', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'alo-preview-'))
  const path = join(directory, 'preview.html')
  try {
    await writeFile(path, '<p>Conteúdo editorial preservado</p><style>/* BEGIN GENERATED PREVIEW *//* END GENERATED PREVIEW */</style><!-- BEGIN GENERATED PINS --><!-- END GENERATED PINS -->')
    await syncPreview(false, flatten(tokens), path)
    const initial = await readFile(path, 'utf8')
    assert.ok(initial.startsWith('<p>Conteúdo editorial preservado</p>'))
    await syncPreview(true, flatten(tokens), path)
    const stale = initial.replace('id="canonical-pins"', 'id="snapshot-obsoleto"')
    await writeFile(path, stale)
    await assert.rejects(syncPreview(true, flatten(tokens), path), /desatualizado/)
    assert.equal(await readFile(path, 'utf8'), stale)
    await writeFile(path, '<p>Sem blocos</p>')
    await assert.rejects(syncPreview(true, flatten(tokens), path), /ausente/)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

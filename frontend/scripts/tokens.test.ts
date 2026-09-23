import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { syncTokens } from './tokens.ts'

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

import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import type { TestContext } from 'node:test'
import { z } from 'zod'
import { packageVercel } from './package-vercel.ts'

async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'vercel-package-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, 'dist/assets'), { recursive: true })
  await writeFile(join(root, 'dist/index.html'), '<html>app</html>')
  await writeFile(join(root, 'dist/assets/app.js'), 'export default 42')
  return root
}

await test('packages static bytes deterministically, clears stale output and preserves project link', async (t) => {
  const root = await fixture(t)
  await mkdir(join(root, '.vercel/output'), { recursive: true })
  await writeFile(join(root, '.vercel/output/stale'), 'old')
  await writeFile(join(root, '.vercel/project.json'), '{"projectId":"local-link"}')
  await writeFile(join(root, '.env'), 'DO_NOT_PUBLISH=secret')
  await packageVercel(root, { VERCEL_TOKEN: 'do-not-archive' })
  const config = await readFile(join(root, '.vercel/output/config.json'), 'utf8')
  assert.deepEqual((await readdir(join(root, '.vercel/output'))).sort(), ['config.json', 'static'])
  for (const file of ['index.html', 'assets/app.js']) {
    assert.deepEqual(await readFile(join(root, `dist/${file}`)), await readFile(join(root, `.vercel/output/static/${file}`)))
  }
  assert.equal(await readFile(join(root, '.vercel/project.json'), 'utf8'), '{"projectId":"local-link"}')
  assert.equal((await readFile(join(root, '.vercel/artifact.json'), 'utf8')).includes('do-not-archive'), false)
  await packageVercel(root, {})
  assert.equal(await readFile(join(root, '.vercel/output/config.json'), 'utf8'), config)
})

await test('rejects missing/empty dist and hidden files, source maps and symlinks', async (t) => {
  const root = await fixture(t)
  await writeFile(join(root, 'dist/index.html'), '')
  await assert.rejects(packageVercel(root, {}), /valid dist\/index.html/)
  await writeFile(join(root, 'dist/index.html'), 'app')
  for (const file of ['.env', 'assets/app.js.map']) {
    await writeFile(join(root, 'dist', file), 'private')
    await assert.rejects(packageVercel(root, {}), /hidden file, source map/)
    await rm(join(root, 'dist', file))
  }
  await symlink(join(root, '.env'), join(root, 'dist/link'))
  await assert.rejects(packageVercel(root, {}), /unsupported entry/)
  await rm(join(root, 'dist'), { recursive: true })
  await assert.rejects(packageVercel(root, {}), /valid dist\/index.html/)
})

await test('generated routes serve files first, reject absent assets and route pages to the SPA', async (t) => {
  const root = await fixture(t)
  await packageVercel(root, {})
  const { routes, version } = z.object({
    version: z.literal(3),
    routes: z.array(z.union([
      z.object({ handle: z.literal('filesystem') }),
      z.object({ src: z.string(), status: z.number().optional(), dest: z.string().optional() }),
    ])),
  }).parse(JSON.parse(await readFile(join(root, '.vercel/output/config.json'), 'utf8')))
  assert.equal(version, 3)
  // Contract simulation, not a substitute for the Vercel remote routing check.
  function resolve(path: string) {
    for (const route of routes) {
      if ('handle' in route) {
        if (['/index.html', '/assets/app.js'].includes(path)) return path
      } else if (new RegExp(`^(?:${route.src})$`).test(path)) return route.status ?? route.dest
    }
  }
  assert.equal(resolve('/assets/app.js'), '/assets/app.js')
  for (const path of ['/assets/missing.js', '/assets/missing', '/missing.css', '/nested/missing.png']) assert.equal(resolve(path), 404)
  for (const path of ['/', '/status', '/unknown/nested', '/unknown/']) assert.equal(resolve(path), '/index.html')
})

import { cp, lstat, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { resolveBuildEnvironment } from './build-ci.ts'
import type { Artifact } from './artifact.ts'

export const routing = {
  version: 3,
  routes: [
    { handle: 'filesystem' },
    { src: '/assets(?:/.*)?', status: 404 },
    { src: '/.*\\.[^/]+/?', status: 404 },
    { src: '/.*', dest: '/index.html', methods: ['GET', 'HEAD'] },
  ],
}

async function validateStaticTree(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    // Fail closed rather than uploading hidden config, source maps or symlinks.
    if (entry.name.startsWith('.') || entry.name.endsWith('.map')
      || (!entry.isFile() && !entry.isDirectory())) {
      throw new Error('dist contains a hidden file, source map or unsupported entry; inspect the build output.')
    }
    if (entry.isDirectory()) await validateStaticTree(join(directory, entry.name))
  }
}

export async function packageVercel(root = process.cwd(), environment: NodeJS.ProcessEnv = process.env) {
  const dist = join(root, 'dist')
  const output = join(root, '.vercel/output')
  try {
    const index = await lstat(join(dist, 'index.html'))
    if (!(await lstat(dist)).isDirectory() || !index.isFile() || index.size === 0) throw new Error()
  } catch {
    throw new Error('A valid dist/index.html is required. Run the frontend build before packaging.')
  }
  await validateStaticTree(dist)
  const resolved = resolveBuildEnvironment(environment)
  const metadata: Artifact = {
    commit: environment.CI_COMMIT_SHA ?? null,
    pipeline: environment.CI_PIPELINE_ID ?? null,
    ref: environment.CI_COMMIT_REF_NAME ?? null,
    production: Boolean(environment.CI_DEFAULT_BRANCH)
      && environment.CI_COMMIT_BRANCH === environment.CI_DEFAULT_BRANCH,
    apiUrl: resolved.VITE_API_URL,
  }
  // Only generated output is cleared; .vercel/project.json is left untouched.
  await rm(output, { recursive: true, force: true })
  await mkdir(output, { recursive: true })
  await cp(dist, join(output, 'static'), { recursive: true })
  await writeFile(join(output, 'config.json'), `${JSON.stringify(routing, null, 2)}\n`)
  await writeFile(join(root, '.vercel/artifact.json'), `${JSON.stringify(metadata, null, 2)}\n`)
  return metadata
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await packageVercel()
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Unexpected packaging failure.')
    process.exitCode = 1
  }
}

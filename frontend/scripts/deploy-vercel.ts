import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'
import { artifactSchema } from './artifact.ts'
import type { RunCommand } from './command.ts'

function requiredVariable(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]
  if (!value?.trim()) throw new Error(`${name} is required. Check GitLab protected variables and environment scope.`)
  return value
}

export function validateDeployment(environment: NodeJS.ProcessEnv, artifact: unknown) {
  const token = requiredVariable(environment, 'VERCEL_TOKEN')
  requiredVariable(environment, 'VERCEL_ORG_ID')
  requiredVariable(environment, 'VERCEL_PROJECT_ID')
  const origin = requiredVariable(environment, 'FRONTEND_PRODUCTION_URL')
  const commit = requiredVariable(environment, 'CI_COMMIT_SHA')
  const ref = requiredVariable(environment, 'CI_COMMIT_REF_NAME')
  const pipeline = requiredVariable(environment, 'CI_PIPELINE_ID')
  if (!environment.CI_DEFAULT_BRANCH
    || environment.CI_COMMIT_BRANCH !== environment.CI_DEFAULT_BRANCH
    || environment.CI_COMMIT_REF_PROTECTED !== 'true') {
    throw new Error('Deploy requires the protected default branch.')
  }
  let url
  try { url = new URL(origin) } catch { /* validated below */ }
  if (!url || url.protocol !== 'https:' || url.origin !== origin) {
    throw new Error('FRONTEND_PRODUCTION_URL must be the canonical HTTPS origin without a path or trailing slash.')
  }
  const parsed = artifactSchema.safeParse(artifact)
  if (!parsed.success || !parsed.data.production || parsed.data.commit !== commit
    || parsed.data.pipeline !== pipeline || parsed.data.ref !== ref) {
    throw new Error('Artifact does not belong to this production commit/pipeline/ref. Run a new validated pipeline.')
  }
  return { token, commit, ref, pipeline }
}

export async function deployVercel(environment: NodeJS.ProcessEnv = process.env, spawn: RunCommand = spawnSync) {
  let artifact: unknown
  try {
    artifact = JSON.parse(await readFile('.vercel/artifact.json', 'utf8'))
    const config: unknown = JSON.parse(await readFile('.vercel/output/config.json', 'utf8'))
    if (!z.object({ version: z.literal(3) }).safeParse(config).success
      || !(await readFile('.vercel/output/static/index.html')).length) throw new Error()
  } catch {
    throw new Error('Missing or invalid prebuilt artifact. Run a new pipeline; deployment never rebuilds the frontend.')
  }
  const validated = validateDeployment(environment, artifact)
  const result = spawn('pnpm', ['exec', 'vercel', 'deploy', '--prebuilt', '--prod', '--yes',
    '--token', validated.token,
    '--meta', `gitlabCommitSha=${validated.commit}`,
    '--meta', `gitlabCommitRef=${validated.ref}`,
    '--meta', `gitlabPipelineId=${validated.pipeline}`,
  ], { env: environment, stdio: 'inherit' })
  if (result.error) throw new Error('Unable to start Vercel CLI. Check the frozen dependency installation.')
  return result.status ?? 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = await deployVercel()
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Unexpected deployment failure.')
    process.exitCode = 1
  }
}

import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

export function validateDeployment(environment, artifact) {
  for (const name of ['VERCEL_TOKEN', 'VERCEL_ORG_ID', 'VERCEL_PROJECT_ID',
    'FRONTEND_PRODUCTION_URL', 'CI_COMMIT_SHA', 'CI_COMMIT_REF_NAME', 'CI_PIPELINE_ID']) {
    if (!environment[name]?.trim()) throw new Error(`${name} is required. Check GitLab protected variables and environment scope.`)
  }
  if (!environment.CI_DEFAULT_BRANCH
    || environment.CI_COMMIT_BRANCH !== environment.CI_DEFAULT_BRANCH
    || environment.CI_COMMIT_REF_PROTECTED !== 'true') {
    throw new Error('Deploy requires the protected default branch.')
  }
  let url
  try { url = new URL(environment.FRONTEND_PRODUCTION_URL) } catch { /* validated below */ }
  if (!url || url.protocol !== 'https:' || url.origin !== environment.FRONTEND_PRODUCTION_URL) {
    throw new Error('FRONTEND_PRODUCTION_URL must be the canonical HTTPS origin without a path or trailing slash.')
  }
  if (artifact?.production !== true || artifact.commit !== environment.CI_COMMIT_SHA
    || artifact.pipeline !== environment.CI_PIPELINE_ID || artifact.ref !== environment.CI_COMMIT_REF_NAME) {
    throw new Error('Artifact does not belong to this production commit/pipeline/ref. Run a new validated pipeline.')
  }
}

export async function deployVercel(environment = process.env, spawn = spawnSync) {
  let artifact
  try {
    artifact = JSON.parse(await readFile('.vercel/artifact.json', 'utf8'))
    const config = JSON.parse(await readFile('.vercel/output/config.json', 'utf8'))
    if (config.version !== 3 || !(await readFile('.vercel/output/static/index.html')).length) throw new Error()
  } catch {
    throw new Error('Missing or invalid prebuilt artifact. Run a new pipeline; deployment never rebuilds the frontend.')
  }
  validateDeployment(environment, artifact)
  const result = spawn('pnpm', ['exec', 'vercel', 'deploy', '--prebuilt', '--prod', '--yes',
    '--token', environment.VERCEL_TOKEN,
    '--meta', `gitlabCommitSha=${artifact.commit}`,
    '--meta', `gitlabCommitRef=${artifact.ref}`,
    '--meta', `gitlabPipelineId=${artifact.pipeline}`,
  ], { env: environment, stdio: 'inherit' })
  if (result.error) throw new Error('Unable to start Vercel CLI. Check the frozen dependency installation.')
  return result.status ?? 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = await deployVercel()
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}

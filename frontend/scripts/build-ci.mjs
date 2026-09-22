import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export function resolveBuildEnvironment(environment) {
  const isDefaultBranch = Boolean(environment.CI_DEFAULT_BRANCH)
    && environment.CI_COMMIT_BRANCH === environment.CI_DEFAULT_BRANCH
  const backendUrl = environment.BACKEND_PRODUCTION_URL?.trim()

  if (isDefaultBranch && !backendUrl) {
    throw new Error('BACKEND_PRODUCTION_URL must be available in the default-branch build job. Check its protection and environment scope in GitLab.')
  }

  if (backendUrl) {
    let url
    try {
      url = new URL(backendUrl)
    } catch {
      throw new Error('BACKEND_PRODUCTION_URL must be a valid HTTPS URL.')
    }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
      throw new Error('BACKEND_PRODUCTION_URL must use HTTPS without credentials, query parameters or fragments.')
    }
  }

  return {
    ...environment,
    // Protected variables may be unavailable in MR pipelines. These builds are
    // validation-only and are never published by the Pages job.
    VITE_API_URL: backendUrl?.replace(/\/+$/, '')
      || environment.VITE_API_URL || 'http://localhost:8080',
  }
}

export function runBuild(environment = process.env, spawn = spawnSync) {
  // Preserve the Pages artifact base until hosting migration (#30).
  // Relative assets do not guarantee refresh at nested URLs.
  const result = spawn('pnpm', ['run', 'build', '--base=./'], {
    env: resolveBuildEnvironment(environment),
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  return result.status ?? 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = runBuild()
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}

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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const environment = resolveBuildEnvironment(process.env)
    // Relative assets work with both unique Pages domains and project subpaths.
    const result = spawnSync('npm', ['run', 'build', '--', '--base=./'], {
      env: environment,
      stdio: 'inherit',
    })
    if (result.error) throw result.error
    process.exitCode = result.status ?? 1
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}

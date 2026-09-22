import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deployVercel, validateDeployment } from './deploy-vercel.mjs'

const environment = {
  VERCEL_TOKEN: 'test-only', VERCEL_ORG_ID: 'test-org', VERCEL_PROJECT_ID: 'test-project',
  FRONTEND_PRODUCTION_URL: 'https://frontend.example.com',
  CI_COMMIT_SHA: 'test-sha', CI_PIPELINE_ID: '123', CI_COMMIT_REF_NAME: 'main',
  CI_DEFAULT_BRANCH: 'main', CI_COMMIT_BRANCH: 'main', CI_COMMIT_REF_PROTECTED: 'true',
}
const artifact = { production: true, commit: 'test-sha', pipeline: '123', ref: 'main' }

test('accepts a production artifact from this protected pipeline', () => {
  assert.doesNotThrow(() => validateDeployment(environment, artifact))
})

test('rejects missing deployment variables without exposing secrets', () => {
  for (const key of ['VERCEL_TOKEN', 'VERCEL_ORG_ID', 'VERCEL_PROJECT_ID', 'FRONTEND_PRODUCTION_URL']) {
    assert.throws(() => validateDeployment({ ...environment, [key]: '' }, artifact), new RegExp(`${key} is required`))
  }
})

test('rejects unprotected branches, validation artifacts and different pipelines or commits', () => {
  for (const change of [{ CI_COMMIT_BRANCH: 'feature/test' }, { CI_COMMIT_REF_PROTECTED: 'false' }, { CI_DEFAULT_BRANCH: '' }]) {
    assert.throws(() => validateDeployment({ ...environment, ...change }, artifact), /protected default branch/)
  }
  for (const change of [{ production: false }, { commit: 'other' }, { pipeline: '122' }, { ref: 'other' }]) {
    assert.throws(() => validateDeployment(environment, { ...artifact, ...change }), /does not belong/)
  }
})

test('requires an exact canonical HTTPS origin', () => {
  for (const url of ['http://localhost:5173', 'invalid', 'https://example.com/', 'https://example.com/path', 'https://user:secret@example.com', 'https://example.com?token=x']) {
    assert.throws(() => validateDeployment({ ...environment, FRONTEND_PRODUCTION_URL: url }, artifact), /canonical HTTPS origin/)
  }
})

test('deploys only existing prebuilt output with traceability and propagates CLI failures', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'vercel-deploy-'))
  const previous = process.cwd()
  process.chdir(root)
  t.after(async () => { process.chdir(previous); await rm(root, { recursive: true, force: true }) })
  let invocation
  const spawn = (...args) => { invocation = args; return { status: 0 } }
  await assert.rejects(deployVercel(environment, spawn), /Missing or invalid prebuilt/)
  assert.equal(invocation, undefined)
  await mkdir('.vercel/output/static', { recursive: true })
  await writeFile('.vercel/output/static/index.html', '<html>app</html>')
  await writeFile('.vercel/output/config.json', '{"version":3}')
  await writeFile('.vercel/artifact.json', JSON.stringify(artifact))
  assert.equal(await deployVercel(environment, spawn), 0)
  assert.equal(invocation[0], 'pnpm')
  assert.deepEqual(invocation[1], ['exec', 'vercel', 'deploy', '--prebuilt', '--prod', '--yes',
    '--token', 'test-only', '--meta', 'gitlabCommitSha=test-sha',
    '--meta', 'gitlabCommitRef=main', '--meta', 'gitlabPipelineId=123'])
  assert.equal(await deployVercel(environment, () => ({ status: 2 })), 2)
  assert.equal(await deployVercel(environment, () => ({ status: null })), 1)
  await assert.rejects(deployVercel(environment, () => ({ error: new Error('spawn') })), /Unable to start/)
  invocation = undefined
  await writeFile('.vercel/artifact.json', JSON.stringify({ ...artifact, pipeline: 'old' }))
  await assert.rejects(deployVercel(environment, spawn), /does not belong/)
  assert.equal(invocation, undefined)
})

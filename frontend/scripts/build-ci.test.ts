import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveBuildEnvironment, runBuild } from './build-ci.ts'
import type { RunCommand } from './command.ts'

const production = { CI_DEFAULT_BRANCH: 'main', CI_COMMIT_BRANCH: 'main' }

await test('maps the GitLab backend URL to Vite and removes trailing slashes', () => {
  const result = resolveBuildEnvironment({
    ...production,
    BACKEND_PRODUCTION_URL: ' https://backend.example.com/// ',
    VITE_API_URL: 'http://localhost:8080',
  })
  assert.equal(result.VITE_API_URL, 'https://backend.example.com')
})

await test('production rejects missing or blank backend variables', () => {
  for (const value of [undefined, '', '   ']) {
    assert.throws(() => resolveBuildEnvironment({
      ...production, BACKEND_PRODUCTION_URL: value,
    }), /must be available/)
  }
})

await test('production does not silently use a local Vite URL', () => {
  assert.throws(() => resolveBuildEnvironment({
    ...production, VITE_API_URL: 'http://localhost:8080',
  }), /must be available/)
})

await test('rejects malformed, insecure or credential-bearing URLs', () => {
  for (const value of [
    '$BACKEND_PRODUCTION_URL', 'not-a-url', 'http://backend.example.com',
    'https://user:password@backend.example.com',
    'https://backend.example.com?token=secret', 'https://backend.example.com#fragment',
    'https://localhost', 'https://api.localhost', 'https://127.0.0.1', 'https://[::1]',
  ]) {
    assert.throws(() => resolveBuildEnvironment({
      ...production, BACKEND_PRODUCTION_URL: value,
    }), /HTTPS/)
  }
})

await test('MR builds work without protected production variables', () => {
  const result = resolveBuildEnvironment({ CI_DEFAULT_BRANCH: 'main' })
  assert.equal(result.VITE_API_URL, 'http://localhost:8080')
})

await test('validation branches preserve an explicitly configured Vite URL', () => {
  const result = resolveBuildEnvironment({
    CI_DEFAULT_BRANCH: 'main', CI_COMMIT_BRANCH: 'fix/pages',
    VITE_API_URL: 'http://localhost:9090',
  })
  assert.equal(result.VITE_API_URL, 'http://localhost:9090')
})


await test('invokes pnpm with the domain root base and validated environment', () => {
  const invocations: Parameters<RunCommand>[] = []
  const status = runBuild({ ...production, BACKEND_PRODUCTION_URL: 'https://api.example.com/' }, (...args) => {
    invocations.push(args)
    return { status: 0 }
  })
  assert.equal(status, 0)
  const invocation = invocations[0]
  assert.ok(invocation)
  assert.deepEqual(invocation.slice(0, 2), ['pnpm', ['run', 'build', '--base=/']])
  assert.equal(invocation[2].env?.VITE_API_URL, 'https://api.example.com')
  assert.equal(invocation[2].stdio, 'inherit')
})

await test('propagates failed, interrupted and unlaunchable builds', () => {
  assert.equal(runBuild({}, () => ({ status: 2 })), 2)
  assert.equal(runBuild({}, () => ({ status: null })), 1)
  assert.throws(() => runBuild({}, () => ({ error: new Error('spawn failed') })), /spawn failed/)
})

await test('invalid production configuration prevents starting the build', () => {
  let started = false
  assert.throws(() => runBuild(production, () => { started = true; return { status: 0 } }), /must be available/)
  assert.equal(started, false)
})

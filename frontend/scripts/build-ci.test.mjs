import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveBuildEnvironment } from './build-ci.mjs'

const production = { CI_DEFAULT_BRANCH: 'main', CI_COMMIT_BRANCH: 'main' }

test('maps the GitLab backend URL to Vite and removes trailing slashes', () => {
  const result = resolveBuildEnvironment({
    ...production,
    BACKEND_PRODUCTION_URL: ' https://backend.example.com/// ',
    VITE_API_URL: 'http://localhost:8080',
  })
  assert.equal(result.VITE_API_URL, 'https://backend.example.com')
})

test('production rejects missing or blank backend variables', () => {
  for (const value of [undefined, '', '   ']) {
    assert.throws(() => resolveBuildEnvironment({
      ...production, BACKEND_PRODUCTION_URL: value,
    }), /must be available/)
  }
})

test('production does not silently use a local Vite URL', () => {
  assert.throws(() => resolveBuildEnvironment({
    ...production, VITE_API_URL: 'http://localhost:8080',
  }), /must be available/)
})

test('rejects malformed, insecure or credential-bearing URLs', () => {
  for (const value of [
    '$BACKEND_PRODUCTION_URL', 'not-a-url', 'http://backend.example.com',
    'https://user:password@backend.example.com',
    'https://backend.example.com?token=secret', 'https://backend.example.com#fragment',
  ]) {
    assert.throws(() => resolveBuildEnvironment({
      ...production, BACKEND_PRODUCTION_URL: value,
    }), /HTTPS/)
  }
})

test('MR builds work without protected production variables', () => {
  const result = resolveBuildEnvironment({ CI_DEFAULT_BRANCH: 'main' })
  assert.equal(result.VITE_API_URL, 'http://localhost:8080')
})

test('validation branches preserve an explicitly configured Vite URL', () => {
  const result = resolveBuildEnvironment({
    CI_DEFAULT_BRANCH: 'main', CI_COMMIT_BRANCH: 'fix/pages',
    VITE_API_URL: 'http://localhost:9090',
  })
  assert.equal(result.VITE_API_URL, 'http://localhost:9090')
})

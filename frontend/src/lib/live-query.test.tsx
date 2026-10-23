import { act, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider, focusManager, onlineManager, useQuery } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { PrivateRequestError } from './api'
import { useLiveReadOptions } from './live-query'

let client: QueryClient
const read = vi.fn<(key: string, signal: AbortSignal) => Promise<string>>()
function Surface({ name = 'A', active = true, report = false }: { name?: string; active?: boolean; report?: boolean }) {
  const options = useLiveReadOptions(active, report)
  const query = useQuery({ queryKey: ['inspection', name], queryFn: ({ signal }) => read(name, signal), ...options })
  return <><output>{query.data}</output>{query.isError && <button onClick={() => { void query.refetch() }}>Tentar novamente</button>}</>
}
function mount(props = {}) {
  const view = render(<QueryClientProvider client={client}><Surface {...props} /></QueryClientProvider>)
  return { ...view, change: (next: { name?: string; active?: boolean; report?: boolean }) => view.rerender(<QueryClientProvider client={client}><Surface {...next} /></QueryClientProvider>) }
}
async function tick(ms = 0) { await act(async () => { await vi.advanceTimersByTimeAsync(ms) }) }
beforeEach(() => {
  vi.useFakeTimers(); focusManager.setFocused(true); onlineManager.setOnline(true)
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } })
  read.mockReset().mockImplementation(async name => name)
})
afterEach(() => { client.clear(); vi.useRealTimers(); focusManager.setFocused(undefined); onlineManager.setOnline(true) })

test('list polls at 60s, report at 120s, focus uses staleTime and pending reads never overlap', async () => {
  const view = mount(); await tick(); expect(read).toHaveBeenCalledTimes(1)
  await act(async () => { focusManager.setFocused(false); focusManager.setFocused(true) }); await tick()
  expect(read).toHaveBeenCalledTimes(1)
  await tick(30_001)
  await act(async () => { focusManager.setFocused(false); focusManager.setFocused(true) }); await tick()
  expect(read).toHaveBeenCalledTimes(2)
  let resolve!: (value: string) => void
  read.mockImplementationOnce(() => new Promise(done => { resolve = done }))
  await tick(60_000); expect(read).toHaveBeenCalledTimes(3)
  await tick(120_000); expect(read).toHaveBeenCalledTimes(3)
  await act(async () => { resolve('updated') }); await tick()
  expect(screen.getByText('updated')).toBeVisible()
  view.change({ name: 'report', report: true }); await tick()
  const before = read.mock.calls.length
  await tick(119_999); expect(read).toHaveBeenCalledTimes(before)
  await tick(1); expect(read).toHaveBeenCalledTimes(before + 1)
})

test('hidden/offline/inactive surfaces pause; stale return reads once and unmount cancels', async () => {
  const view = mount(); await tick()
  await act(async () => { focusManager.setFocused(false) }); await tick(180_000)
  expect(read).toHaveBeenCalledTimes(1)
  await act(async () => { focusManager.setFocused(true) }); await tick()
  expect(read).toHaveBeenCalledTimes(2)
  await act(async () => { onlineManager.setOnline(false) }); await tick(180_000)
  expect(read).toHaveBeenCalledTimes(2)
  await act(async () => { onlineManager.setOnline(true) }); await tick()
  expect(read).toHaveBeenCalledTimes(3)
  view.change({ active: false }); await tick(180_000); expect(read).toHaveBeenCalledTimes(3)
  read.mockImplementationOnce(() => new Promise(() => {}))
  view.change({ active: true }); await tick(); expect(read).toHaveBeenCalledTimes(4)
  const signal = read.mock.calls.at(-1)![1]
  view.unmount(); expect(signal.aborted).toBe(true)
})

test.each([true, false])('transient failures back off and reset after recovery, initial data=%s', async withData => {
  if (!withData) read.mockRejectedValue(new TypeError('network'))
  mount(); await tick(); if (withData) expect(screen.getByText('A')).toBeVisible()
  read.mockRejectedValue(new TypeError('network'))
  for (const delay of withData ? [60_000, 60_000, 120_000, 240_000, 300_000] : [60_000, 120_000, 240_000, 300_000]) {
    const before = read.mock.calls.length
    await tick(delay - 1); expect(read).toHaveBeenCalledTimes(before)
    await tick(1); expect(read).toHaveBeenCalledTimes(before + 1)
    if (withData) expect(screen.getByText('A')).toBeVisible()
  }
  read.mockResolvedValue('recovered'); await tick(300_000); await tick(1)
  expect(screen.getByText('recovered')).toBeVisible()
  const before = read.mock.calls.length; await tick(60_000); expect(read).toHaveBeenCalledTimes(before + 1)
})

test.each([new PrivateRequestError(403), new SyntaxError('invalid JSON'), new Error('schema invalid')])('permanent error stops automatic reads until explicit retry (%s)', async failure => {
  read.mockRejectedValue(failure); mount(); await tick()
  expect(read).toHaveBeenCalledTimes(1)
  await tick(600_000)
  await act(async () => { focusManager.setFocused(false); focusManager.setFocused(true); onlineManager.setOnline(false); onlineManager.setOnline(true) }); await tick()
  expect(read).toHaveBeenCalledTimes(1)
  read.mockResolvedValue('recovered'); fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' })); await tick()
  expect(screen.getByText('recovered')).toBeVisible()
  await tick(60_000); expect(read).toHaveBeenCalledTimes(3)
})

test('slow A is aborted and cannot replace B; hidden mount waits for visibility', async () => {
  focusManager.setFocused(false)
  const view = mount(); await tick(); expect(read).not.toHaveBeenCalled()
  read.mockImplementationOnce(() => new Promise(() => {}))
  await act(async () => { focusManager.setFocused(true) }); await tick()
  const signal = read.mock.calls[0][1]
  view.change({ name: 'B' }); await tick()
  expect(signal.aborted).toBe(true); expect(screen.getByText('B')).toBeVisible()
  await tick(60_000); expect(read.mock.calls.map(([name]) => name)).toEqual(['A', 'B', 'B'])
})

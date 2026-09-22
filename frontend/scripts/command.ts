import type { SpawnSyncOptions } from 'node:child_process'

// Keep the injected test runner limited to the process result we actually use.
export type RunCommand = (
  command: string,
  args: string[],
  options: SpawnSyncOptions,
) => { status?: number | null; error?: Error }

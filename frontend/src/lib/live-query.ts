import { useSyncExternalStore } from 'react'
import { focusManager, onlineManager } from '@tanstack/react-query'
import { PrivateRequestError, PublicRequestError } from './api'

export const LIVE_LIST_INTERVAL = 60_000
export const LIVE_REPORT_INTERVAL = 120_000
export const LIVE_MAX_BACKOFF = 300_000

export function deniedRead(error: unknown) {
  return error instanceof PrivateRequestError && error.status === 403
}
export function permanentReadError(error: unknown) {
  if (!error) return false
  if (error instanceof PrivateRequestError || error instanceof PublicRequestError)
    return error.status < 500 && error.status !== 408 && error.status !== 429
  // Native fetch network failures are TypeError. Schema/configuration/JSON
  // errors stop automatically; explicit retry still goes through the same schema.
  return !(error instanceof TypeError)
}
const subscribeFocus = (notify: () => void) => focusManager.subscribe(notify)
const subscribeOnline = (notify: () => void) => onlineManager.subscribe(notify)
const focused = () => focusManager.isFocused()
const online = () => onlineManager.isOnline()
type ReadQuery = { state: { error: Error | null; errorUpdateCount: number; status: string } }
const failures = new WeakMap<object, { count: number; seen: number }>()
function intervalFor(query: ReadQuery, interval: number): number | false {
  if (permanentReadError(query.state.error)) return false
  if (!query.state.error) {
    // Starting an initial refetch clears its error before it succeeds. Only a
    // validated success resets backoff; a pending attempt must keep its history.
    if (query.state.status === 'success') failures.delete(query)
    return interval
  }
  const previous = failures.get(query) ?? { count: 0, seen: -1 }
  if (previous.seen !== query.state.errorUpdateCount) {
    previous.count++; previous.seen = query.state.errorUpdateCount; failures.set(query, previous)
  }
  return Math.min(LIVE_MAX_BACKOFF, interval * 2 ** Math.min(previous.count - 1, 3))
}

// Subscribe to Query's existing managers, not additional DOM listeners/timers.
// Only the selected read surface uses this hook. Details/writes/PDF stay outside.
export function useLiveReadOptions(active = true, report = false) {
  const visible = useSyncExternalStore(subscribeFocus, focused)
  const connected = useSyncExternalStore(subscribeOnline, online)
  const interval = report ? LIVE_REPORT_INTERVAL : LIVE_LIST_INTERVAL
  return {
    enabled: (query: ReadQuery) => active && visible && connected && !permanentReadError(query.state.error),
    staleTime: interval / 2,
    retry: false as const,
    refetchIntervalInBackground: false,
    refetchInterval: (query: ReadQuery) => intervalFor(query, interval),
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  }
}

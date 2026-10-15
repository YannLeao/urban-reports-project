// Keep shell notification requests independent of the ordered fetch fixtures used
// by auth/report tests. The real bell and central are exercised together in NotificationsPage.test.tsx.
export function withEmptyNotifications(fetchForFeature: typeof fetch): typeof fetch {
  return (input, init) => {
    if (new URL(String(input)).pathname === '/api/notifications') {
      return Promise.resolve(Response.json({ items: [], page: 0, size: 20, totalItems: 0, totalPages: 0, unreadCount: 0 }))
    }
    return fetchForFeature(input, init)
  }
}

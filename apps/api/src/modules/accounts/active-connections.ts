const connections = new Map<string, Set<() => void>>()

export function trackAccountConnection(accountId: string, close: () => void): () => void {
  const active = connections.get(accountId) ?? new Set<() => void>()
  active.add(close)
  connections.set(accountId, active)
  return () => {
    active.delete(close)
    if (!active.size) connections.delete(accountId)
  }
}

export function revokeAccountConnections(accountId: string): void {
  const active = connections.get(accountId)
  connections.delete(accountId)
  for (const close of active ?? []) close()
}

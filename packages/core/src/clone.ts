export function deepClone<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value)
    } catch {
      // Structured clone rejects proxies (e.g. Vue reactive schema nodes);
      // schema data is JSON-safe, so fall back to a JSON round trip.
    }
  }
  return JSON.parse(JSON.stringify(value)) as T
}

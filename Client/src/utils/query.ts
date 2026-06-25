// buildQuery turns a flat params object into a query string, dropping
// undefined/null/empty entries and emitting a leading `?` (or '' when empty).
// Shared by the list endpoints in api/ so the filter-serialization logic lives
// in one place.
export const buildQuery = (params: object): string => {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== '',
  )
  if (entries.length === 0) return ''
  const search = new URLSearchParams()
  for (const [k, v] of entries) {
    search.set(k, String(v))
  }
  return `?${search.toString()}`
}

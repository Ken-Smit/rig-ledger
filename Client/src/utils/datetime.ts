// isoToLocalInput converts a server-returned ISO timestamp into the
// `YYYY-MM-DDTHH:mm` shape required by <input type="datetime-local">. The
// browser interprets that string as a local time, which matches the truck
// stop's clock — UTC conversion happens at submit time.
export function isoToLocalInput(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`
}

// localInputToIso converts the datetime-local string back to a UTC ISO string
// for the server. new Date(local) parses the local string in the browser tz.
export function localInputToIso(local: string): string {
  if (!local) return ''
  return new Date(local).toISOString()
}

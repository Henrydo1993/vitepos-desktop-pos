export interface TicketItem {
  name: string
  qty: number
  station: string
  modifiers?: string[]
}

export function routeByStation(items: TicketItem[]): Record<string, TicketItem[]> {
  const out: Record<string, TicketItem[]> = {}
  for (const it of items) {
    const st = it.station || 'kitchen'
    ;(out[st] ??= []).push(it)
  }
  return out
}

// Front-of-house categories (coffee / juice / desserts) print on their own paper; the
// rest go to the kitchen. Exact live category names, matched case-insensitively.
const FOH_CATEGORIES = new Set(['coffee house', 'fresh pressed juices', 'sweet endings'])
export function stationForCategory(category?: string | null): string {
  return FOH_CATEGORIES.has(String(category ?? '').trim().toLowerCase()) ? 'foh' : 'kitchen'
}
export function stationLabel(station: string): string {
  if (station === 'foh') return 'FRONT OF HOUSE'
  if (station === 'kitchen') return 'KITCHEN'
  return station.toUpperCase()
}

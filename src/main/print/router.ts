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

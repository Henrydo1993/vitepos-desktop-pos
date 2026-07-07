import type { TicketItem } from './router'

export function buildKitchenTicket(o: {
  token: number
  station: string
  items: TicketItem[]
  orderType?: string
  note?: string
}): string {
  const lines = [`*** ${o.station} ***`, `TOKEN #${o.token}`]
  if (o.orderType) lines.push(o.orderType.replace('_', '-').toUpperCase())
  lines.push('--------------------------------')
  for (const it of o.items) {
    lines.push(`${it.qty} x ${it.name}`)
    for (const m of it.modifiers ?? []) lines.push(`   - ${m}`)
  }
  if (o.note) lines.push('--------------------------------', `NOTE: ${o.note}`)
  lines.push('--------------------------------', new Date().toLocaleTimeString())
  return lines.join('\n')
}

export function buildReceipt(o: {
  token: number
  items: { name: string; qty: number; price: number }[]
  subtotal: number
  discount: number
  tax: number
  total: number
  tender: number
  change: number
  orderType?: string
  customerName?: string
}): string {
  const money = (n: number) => `$${n.toFixed(2)}`
  const lines = ['RECEIPT', `TOKEN #${o.token}`]
  if (o.orderType) lines.push(o.orderType.replace('_', '-').toUpperCase())
  if (o.customerName) lines.push(`Customer: ${o.customerName}`)
  lines.push('--------------------------------')
  for (const it of o.items) lines.push(`${it.qty} x ${it.name}  ${money(it.price * it.qty)}`)
  lines.push(
    '--------------------------------',
    `Subtotal ${money(o.subtotal)}`,
    ...(o.discount ? [`Discount -${money(o.discount)}`] : []),
    `Tax ${money(o.tax)}`,
    `TOTAL ${money(o.total)}`,
    `Cash ${money(o.tender)}`,
    `Change ${money(o.change)}`,
    '',
    'Thank you!',
  )
  return lines.join('\n')
}

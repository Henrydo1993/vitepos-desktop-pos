export interface PriceLine {
  price: number
  qty: number
  taxRate: number
}
export type Discount = { type: 'flat' | 'percent'; value: number } | null

const cents = (n: number) => Math.round(n * 100) / 100

export function priceOrder(lines: PriceLine[], discount: Discount) {
  const subtotal = cents(lines.reduce((s, l) => s + l.price * l.qty, 0))
  let disc = 0
  if (discount) disc = discount.type === 'flat' ? discount.value : subtotal * (discount.value / 100)
  disc = cents(Math.min(disc, subtotal))

  const netByRate = new Map<number, number>()
  const factor = subtotal > 0 ? (subtotal - disc) / subtotal : 0
  for (const l of lines) {
    const net = l.price * l.qty * factor
    netByRate.set(l.taxRate, (netByRate.get(l.taxRate) ?? 0) + net)
  }
  let tax = 0
  for (const [rate, net] of netByRate) tax += net * rate
  tax = cents(tax)

  return { subtotal, discount: disc, tax, total: cents(subtotal - disc + tax) }
}

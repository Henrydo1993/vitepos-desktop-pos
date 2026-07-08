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

// Receipt template mirrored from Vitepos `inv_settings` (fetched + cached from
// /basic/settings). The printer renders it with real formatting (see engine.ts).
export interface ReceiptConfig {
  shopName: string
  currency: string
  header: string
  showHeader: boolean
  vatReg: string
  vatRegLabel: string
  showVatReg: boolean
  showOutletInfo: boolean
  showOutletPhone: boolean
  showOutletAddress: boolean
  outletPhone: string
  outletAddress: string
  showCounter: boolean
  counterLabel: string
  showCustomer: boolean
  showCustomerName: boolean
  showCustomerPhone: boolean
  customerLabel: string
  customerPhoneLabel: string
  showOrderNo: boolean
  orderNoLabel: string
  showOrderType: boolean
  showTable: boolean
  showWaiter: boolean
  showDiscount: boolean
  taxLabel: string
  footer: string
  showFooter: boolean
  footerExtra: string
  pageWidth: number
}

export interface ReceiptData {
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
  customerPhone?: string
  staffName?: string
}

// End-of-day summary printed on the counter at close.
export interface DayReport {
  shopName: string
  date: string
  openedAt: string
  openedBy: string
  closedAt: string
  closedBy: string
  orders: number
  gross: number
  byMethod: { method: string; n: number; amt: number }[]
  openingFloat: number
  cashSales: number
  cashExpected: number
  countedCash: number | null
}

// Fallback when the store config hasn't been fetched yet (first run / offline).
export const DEFAULT_RECEIPT: ReceiptConfig = {
  shopName: 'Receipt',
  currency: '$',
  header: '',
  showHeader: true,
  vatReg: '',
  vatRegLabel: 'Vat No',
  showVatReg: false,
  showOutletInfo: false,
  showOutletPhone: false,
  showOutletAddress: false,
  outletPhone: '',
  outletAddress: '',
  showCounter: true,
  counterLabel: 'Processed By',
  showCustomer: true,
  showCustomerName: true,
  showCustomerPhone: true,
  customerLabel: 'Customer',
  customerPhoneLabel: 'Phone',
  showOrderNo: true,
  orderNoLabel: 'Order No',
  showOrderType: false,
  showTable: false,
  showWaiter: false,
  showDiscount: true,
  taxLabel: 'Tax',
  footer: 'Thank you!',
  showFooter: true,
  footerExtra: '',
  pageWidth: 80,
}

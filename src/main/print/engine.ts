import { ThermalPrinter, PrinterTypes } from 'node-thermal-printer'
import { EventEmitter } from 'node:events'
import type { ReceiptConfig, ReceiptData, DayReport, KitchenTicket } from './tickets'

// address: 'tcp://192.168.1.50' (network) or a USB device path
export interface PrinterCfg {
  station: string
  type: 'epson' | 'star'
  address: string
}

export const printEvents = new EventEmitter() // emits 'ok' {station} and 'fail' {station,error}

function make(cfg: PrinterCfg) {
  return new ThermalPrinter({
    type: cfg.type === 'star' ? PrinterTypes.STAR : PrinterTypes.EPSON,
    interface: cfg.address,
  })
}

export async function printBody(cfg: PrinterCfg, body: string, opts: { kickDrawer?: boolean } = {}) {
  const p = make(cfg)
  if (!(await p.isPrinterConnected())) throw new Error(`printer ${cfg.station} offline (${cfg.address})`)
  p.alignCenter()
  p.println(body)
  p.cut()
  if (opts.kickDrawer) p.openCashDrawer()
  await p.execute()
}

export async function printWithRetry(
  cfg: PrinterCfg,
  body: string,
  opts: { kickDrawer?: boolean } = {},
  tries = 3,
) {
  let lastErr: unknown
  for (let i = 0; i < tries; i++) {
    try {
      await printBody(cfg, body, opts)
      printEvents.emit('ok', { station: cfg.station })
      return
    } catch (e) {
      lastErr = e
      await new Promise((r) => setTimeout(r, 400 * (i + 1)))
    }
  }
  printEvents.emit('fail', { station: cfg.station, error: String(lastErr) })
  throw lastErr
}

// Render a customer receipt with real printer formatting, honouring the Vitepos
// invoice/receipt config (header, VAT, outlet/counter/customer toggles, footer).
async function receiptOnce(cfg: PrinterCfg, o: ReceiptData, r: ReceiptConfig, opts: { kickDrawer?: boolean }) {
  const p = make(cfg)
  if (!(await p.isPrinterConnected())) throw new Error(`printer ${cfg.station} offline (${cfg.address})`)
  const money = (n: number) => `${r.currency}${n.toFixed(2)}`

  if (r.showHeader && (r.header || r.shopName)) {
    p.alignCenter()
    p.bold(true)
    p.setTextSize(1, 1)
    p.println(r.header || r.shopName)
    p.setTextNormal()
    p.bold(false)
  }
  if (r.showVatReg && r.vatReg) {
    p.alignCenter()
    p.println(`${r.vatRegLabel}: ${r.vatReg}`)
  }
  if (r.showOutletInfo) {
    p.alignCenter()
    if (r.showOutletPhone && r.outletPhone) p.println(r.outletPhone)
    if (r.showOutletAddress && r.outletAddress) p.println(r.outletAddress)
  }

  p.alignLeft()
  p.drawLine()
  if (r.showOrderNo) p.println(`${r.orderNoLabel}: #${o.token}`)
  p.println(new Date().toLocaleString('en-AU'))
  if (r.showCounter && o.staffName) p.println(`${r.counterLabel}: ${o.staffName}`)
  if (r.showOrderType && o.orderType) p.println(`Type: ${o.orderType.replace('_', '-')}`)
  if (r.showCustomer && o.customerName) {
    if (r.showCustomerName) p.println(`${r.customerLabel}: ${o.customerName}`)
    if (r.showCustomerPhone && o.customerPhone) p.println(`${r.customerPhoneLabel}: ${o.customerPhone}`)
  }
  p.drawLine()
  for (const it of o.items) p.leftRight(`${it.qty} x ${it.name}`, money(it.price * it.qty))
  p.drawLine()
  p.leftRight('Subtotal', money(o.subtotal))
  if (r.showDiscount && o.discount) p.leftRight('Discount', `-${money(o.discount)}`)
  p.leftRight(r.taxLabel, money(o.tax))
  if (o.fee) p.leftRight('Surcharge', money(o.fee))
  p.bold(true)
  p.leftRight('TOTAL', money(o.total))
  p.bold(false)
  if (o.tender) p.leftRight('Paid', money(o.tender))
  if (o.change) p.leftRight('Change', money(o.change))

  p.newLine()
  if (r.showFooter) {
    p.alignCenter()
    p.println(r.footer || 'Thank you!')
  }
  if (r.footerExtra) {
    p.alignCenter()
    p.println(r.footerExtra)
  }
  p.cut()
  if (opts.kickDrawer) p.openCashDrawer()
  await p.execute()
}

export async function printReceiptWithRetry(
  cfg: PrinterCfg,
  o: ReceiptData,
  r: ReceiptConfig,
  opts: { kickDrawer?: boolean } = {},
  tries = 3,
) {
  let lastErr: unknown
  for (let i = 0; i < tries; i++) {
    try {
      await receiptOnce(cfg, o, r, opts)
      printEvents.emit('ok', { station: cfg.station })
      return
    } catch (e) {
      lastErr = e
      await new Promise((res) => setTimeout(res, 400 * (i + 1)))
    }
  }
  printEvents.emit('fail', { station: cfg.station, error: String(lastErr) })
  throw lastErr
}

// End-of-day sales summary (Z-report) with proper formatting.
async function reportOnce(cfg: PrinterCfg, r: DayReport, opts: { kickDrawer?: boolean }) {
  const p = make(cfg)
  if (!(await p.isPrinterConnected())) throw new Error(`printer ${cfg.station} offline (${cfg.address})`)
  const money = (n: number) => `$${n.toFixed(2)}`
  p.alignCenter()
  p.bold(true)
  p.setTextSize(1, 1)
  p.println('END OF DAY')
  p.setTextNormal()
  if (r.shopName) p.println(r.shopName)
  p.bold(false)
  p.println(r.date)
  p.alignLeft()
  p.drawLine()
  if (r.openedAt) p.println(`Opened: ${r.openedAt}${r.openedBy ? ' · ' + r.openedBy : ''}`)
  if (r.closedAt) p.println(`Closed: ${r.closedAt}${r.closedBy ? ' · ' + r.closedBy : ''}`)
  p.drawLine()
  p.leftRight('Orders', String(r.orders))
  p.bold(true)
  p.leftRight('Gross sales', money(r.gross))
  p.bold(false)
  p.drawLine()
  p.println('By payment method')
  for (const m of r.byMethod) p.leftRight(`  ${m.method} (${m.n})`, money(m.amt))
  p.drawLine()
  p.leftRight('Opening float', money(r.openingFloat))
  p.leftRight('Cash sales', money(r.cashSales))
  p.bold(true)
  p.leftRight('Cash expected', money(r.cashExpected))
  p.bold(false)
  if (r.countedCash != null) {
    p.leftRight('Counted', money(r.countedCash))
    p.leftRight('Over / Short', money(r.countedCash - r.cashExpected))
  }
  p.drawLine()
  p.newLine()
  p.cut()
  if (opts.kickDrawer) p.openCashDrawer()
  await p.execute()
}

export async function printReportWithRetry(cfg: PrinterCfg, r: DayReport, opts: { kickDrawer?: boolean } = {}, tries = 3) {
  let lastErr: unknown
  for (let i = 0; i < tries; i++) {
    try {
      await reportOnce(cfg, r, opts)
      printEvents.emit('ok', { station: cfg.station })
      return
    } catch (e) {
      lastErr = e
      await new Promise((res) => setTimeout(res, 400 * (i + 1)))
    }
  }
  printEvents.emit('fail', { station: cfg.station, error: String(lastErr) })
  throw lastErr
}

// Kitchen / "PREPARE" slip — big text so it reads across the room; the table
// name is the largest thing on the ticket (3x), items are 2x.
async function kitchenOnce(cfg: PrinterCfg, t: KitchenTicket) {
  const p = make(cfg)
  if (!(await p.isPrinterConnected())) throw new Error(`printer ${cfg.station} offline (${cfg.address})`)
  p.alignCenter()
  p.bold(true)
  p.setTextSize(1, 1)
  p.println(`*** ${t.station} ***`)
  p.setTextNormal()
  p.bold(false)
  if (t.table) {
    p.bold(true)
    p.setTextSize(2, 2)
    p.println(t.table.toUpperCase())
    p.setTextNormal()
    p.bold(false)
  }
  p.bold(true)
  p.setTextSize(1, 1)
  p.println(`TOKEN #${t.token}`)
  p.setTextNormal()
  p.bold(false)
  if (t.orderType) p.println(t.orderType.replace('_', '-').toUpperCase())
  p.drawLine()
  p.alignLeft()
  for (const it of t.items) {
    p.setTextSize(1, 1)
    p.println(`${it.qty} x ${it.name}`)
    p.setTextNormal()
    for (const m of it.modifiers ?? []) p.println(`   - ${m}`)
  }
  if (t.note) {
    p.drawLine()
    p.bold(true)
    p.setTextSize(1, 1)
    p.println(`NOTE: ${t.note}`)
    p.setTextNormal()
    p.bold(false)
  }
  p.drawLine()
  p.alignCenter()
  p.println(t.time)
  p.newLine()
  p.cut()
  await p.execute()
}

export async function printKitchenWithRetry(cfg: PrinterCfg, t: KitchenTicket, tries = 3) {
  let lastErr: unknown
  for (let i = 0; i < tries; i++) {
    try {
      await kitchenOnce(cfg, t)
      printEvents.emit('ok', { station: cfg.station })
      return
    } catch (e) {
      lastErr = e
      await new Promise((res) => setTimeout(res, 400 * (i + 1)))
    }
  }
  printEvents.emit('fail', { station: cfg.station, error: String(lastErr) })
  throw lastErr
}

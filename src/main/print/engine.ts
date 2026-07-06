import { ThermalPrinter, PrinterTypes } from 'node-thermal-printer'
import { EventEmitter } from 'node:events'

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

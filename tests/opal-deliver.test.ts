import { describe, it, expect, vi } from 'vitest'
import { deliverOpalOrder, type DeliverDeps } from '../src/main/sync/online'

const order = { remoteId: 385, token: 385, items: [{ name: 'Chân Gà', qty: 1, price: 19.9, station: 'kitchen', modifiers: [] }], total: 0, table: 'Table 15' }

const deps = (over: Partial<DeliverDeps> = {}): DeliverDeps => ({
  record: vi.fn(),
  markSeen: vi.fn(),
  print: vi.fn(),
  onReceived: vi.fn(),
  onPrintFail: vi.fn(),
  ...over,
})

describe('deliverOpalOrder — QR orders must never be silently dropped', () => {
  it('happy path: records → marks seen → prints → surfaces received', async () => {
    const d = deps()
    await deliverOpalOrder(order, d)
    expect(d.record).toHaveBeenCalledWith(order)
    expect(d.markSeen).toHaveBeenCalledWith(385)
    expect(d.print).toHaveBeenCalledWith(order)
    expect(d.onReceived).toHaveBeenCalledWith(order)
    expect(d.onPrintFail).not.toHaveBeenCalled()
  })

  it('recording fails → order is NOT marked seen, so the next poll retries it (not lost)', async () => {
    const d = deps({ record: vi.fn(() => { throw new Error('db locked') }) })
    await expect(deliverOpalOrder(order, d)).rejects.toThrow('db locked')
    expect(d.markSeen).not.toHaveBeenCalled() // <- the whole point: unrecorded = retryable
    expect(d.print).not.toHaveBeenCalled()
  })

  it('printer throws synchronously → order is still recorded + marked seen, failure surfaced, no false chime', async () => {
    const err = new Error('printer offline')
    const d = deps({ print: vi.fn(() => { throw err }) })
    await deliverOpalOrder(order, d)
    expect(d.record).toHaveBeenCalled()
    expect(d.markSeen).toHaveBeenCalledWith(385) // recorded on the floor, operator reprints
    expect(d.onPrintFail).toHaveBeenCalledWith(order, err)
    expect(d.onReceived).not.toHaveBeenCalled() // no contradictory "→ kitchen" chime on a print fail
  })

  // The regression that lost a dinner service: the real print is async. A fire-and-forget print
  // (unawaited) would let this rejection escape and onPrintFail would never run. Awaiting is what
  // makes the failure reach the operator.
  it('printer REJECTS asynchronously → failure is still caught and surfaced (not swallowed)', async () => {
    const err = new Error('ECONNREFUSED 192.168.1.50:9100')
    const d = deps({ print: vi.fn(() => Promise.reject(err)) })
    await deliverOpalOrder(order, d)
    expect(d.markSeen).toHaveBeenCalledWith(385)
    expect(d.onPrintFail).toHaveBeenCalledWith(order, err)
    expect(d.onReceived).not.toHaveBeenCalled()
  })
})

import { create } from 'zustand'
import type { CartLine, MenuItem } from '../types'

export type OrderType = 'table' | 'walk_in' | 'takeaway' | 'delivery'
export type Discount = { type: 'flat' | 'percent'; value: number } | null
// A fee/surcharge is a flat dollar amount OR a percent of the subtotal (same shape as Discount).
export type Fee = { type: 'flat' | 'percent'; value: number } | null
export const feeAmount = (fee: Fee, subtotal: number): number =>
  !fee ? 0 : fee.type === 'flat' ? Math.max(0, fee.value) : (subtotal * Math.max(0, fee.value)) / 100
export interface Customer {
  id: number
  name: string
}

// Front-of-house categories (coffee / juice / desserts) route to their own prepare paper;
// the rest go to the kitchen. Keep in sync with print/router.ts stationForCategory().
const FOH_CATEGORIES = new Set(['coffee house', 'fresh pressed juices', 'sweet endings'])
const stationOf = (m: MenuItem): string => (FOH_CATEGORIES.has((m.category ?? '').trim().toLowerCase()) ? 'foh' : 'kitchen')

interface CartState {
  lines: CartLine[]
  held: CartLine[][]
  orderType: OrderType
  discount: Discount
  note: string
  customer: Customer | null
  fee: Fee
  tableLabel: string | null
  openOrderId: number | null
  add: (m: MenuItem) => void
  setQty: (i: number, qty: number) => void
  changeQty: (i: number, d: number) => void
  removeLine: (i: number) => void
  clear: () => void
  hold: () => void
  recall: (i: number) => void
  setOrderType: (t: OrderType) => void
  setDiscount: (d: Discount) => void
  setNote: (n: string) => void
  setCustomer: (c: Customer | null) => void
  setFee: (f: Fee) => void
  discardHeld: (i: number) => void
  setTable: (label: string | null, openId?: number | null) => void
  loadOpen: (o: { id: number; tableLabel: string; orderType?: string; lines: CartLine[]; note?: string; customerId?: number | null; customerName?: string | null }) => void
  markAllSent: () => void
}

const RESET: Partial<CartState> = { lines: [], discount: null, note: '', customer: null, fee: null, tableLabel: null, openOrderId: null }

export const useCart = create<CartState>((set) => ({
  lines: [],
  held: [],
  orderType: 'walk_in',
  discount: null,
  note: '',
  customer: null,
  fee: null,
  tableLabel: null,
  openOrderId: null,
  add: (m) =>
    set((s) => {
      // Match an unsent line only — items already fired to the kitchen stay locked.
      const idx = s.lines.findIndex((l) => l.product_id === m.id && !l.sent)
      if (idx >= 0) {
        const lines = [...s.lines]
        lines[idx] = { ...lines[idx], qty: lines[idx].qty + 1 }
        return { lines }
      }
      return {
        lines: [
          ...s.lines,
          {
            product_id: m.id,
            name: m.name,
            price: m.price,
            qty: 1,
            station: stationOf(m),
            taxable: m.taxable,
            tax_rate: m.tax_rate,
            image: m.image,
            modifiers: [],
          },
        ],
      }
    }),
  setQty: (i, qty) =>
    set((s) => {
      const lines = [...s.lines]
      lines[i] = { ...lines[i], qty: Math.max(1, Math.floor(qty || 1)) }
      return { lines }
    }),
  changeQty: (i, d) =>
    set((s) => {
      const lines = [...s.lines]
      lines[i] = { ...lines[i], qty: Math.max(0, lines[i].qty + d) }
      return { lines: lines.filter((l) => l.qty > 0) }
    }),
  removeLine: (i) => set((s) => ({ lines: s.lines.filter((_, j) => j !== i) })),
  clear: () => set({ ...RESET }),
  hold: () => set((s) => (s.lines.length ? { held: [...s.held, s.lines], ...RESET } : s)),
  recall: (i) => set((s) => ({ lines: s.held[i], held: s.held.filter((_, j) => j !== i) })),
  // Switching to a non-table type releases the table (walk-in/takeaway/delivery aren't table-bound).
  setOrderType: (t) => set(t === 'table' ? { orderType: t } : { orderType: t, tableLabel: null, openOrderId: null }),
  setDiscount: (d) => set({ discount: d }),
  setNote: (n) => set({ note: n }),
  setCustomer: (c) => set({ customer: c }),
  setFee: (f) => set({ fee: f }),
  discardHeld: (i) => set((s) => ({ held: s.held.filter((_, j) => j !== i) })),
  setTable: (label, openId = null) => set({ tableLabel: label, openOrderId: openId, orderType: 'table' }),
  loadOpen: (o) =>
    set({
      lines: o.lines.map((l) => ({ ...l })),
      tableLabel: o.tableLabel,
      openOrderId: o.id,
      orderType: (o.orderType as OrderType) || 'table',
      note: o.note ?? '',
      customer: o.customerId ? { id: o.customerId, name: o.customerName ?? '' } : null,
      discount: null,
      fee: null,
    }),
  markAllSent: () => set((s) => ({ lines: s.lines.map((l) => ({ ...l, sent: true })) })),
}))

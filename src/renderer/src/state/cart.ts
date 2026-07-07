import { create } from 'zustand'
import type { CartLine, MenuItem } from '../types'

export type OrderType = 'dine_in' | 'takeaway' | 'delivery'
export type Discount = { type: 'flat' | 'percent'; value: number } | null
export interface Customer {
  id: number
  name: string
}

const stationOf = (m: MenuItem): string =>
  /drink|beverage|coffee|tea|juice|soda|bar|smoothie|latte|shake|water|che\b/i.test(`${m.category ?? ''} ${m.name}`)
    ? 'bar'
    : 'kitchen'

interface CartState {
  lines: CartLine[]
  held: CartLine[][]
  orderType: OrderType
  discount: Discount
  note: string
  customer: Customer | null
  fee: number
  add: (m: MenuItem) => void
  setQty: (i: number, qty: number) => void
  changeQty: (i: number, d: number) => void
  clear: () => void
  hold: () => void
  recall: (i: number) => void
  setOrderType: (t: OrderType) => void
  setDiscount: (d: Discount) => void
  setNote: (n: string) => void
  setCustomer: (c: Customer | null) => void
  setFee: (n: number) => void
  discardHeld: (i: number) => void
}

const RESET: Partial<CartState> = { lines: [], discount: null, note: '', customer: null, fee: 0 }

export const useCart = create<CartState>((set) => ({
  lines: [],
  held: [],
  orderType: 'dine_in',
  discount: null,
  note: '',
  customer: null,
  fee: 0,
  add: (m) =>
    set((s) => {
      const idx = s.lines.findIndex((l) => l.product_id === m.id)
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
  clear: () => set({ ...RESET }),
  hold: () => set((s) => (s.lines.length ? { held: [...s.held, s.lines], ...RESET } : s)),
  recall: (i) => set((s) => ({ lines: s.held[i], held: s.held.filter((_, j) => j !== i) })),
  setOrderType: (t) => set({ orderType: t }),
  setDiscount: (d) => set({ discount: d }),
  setNote: (n) => set({ note: n }),
  setCustomer: (c) => set({ customer: c }),
  setFee: (n) => set({ fee: Math.max(0, n || 0) }),
  discardHeld: (i) => set((s) => ({ held: s.held.filter((_, j) => j !== i) })),
}))

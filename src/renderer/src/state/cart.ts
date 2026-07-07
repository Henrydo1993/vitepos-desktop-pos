import { create } from 'zustand'
import type { CartLine, MenuItem } from '../types'

const stationOf = (m: MenuItem): string =>
  /drink|beverage|coffee|tea|juice|soda|bar|smoothie|latte|shake|water|che\b/i.test(`${m.category ?? ''} ${m.name}`)
    ? 'bar'
    : 'kitchen'

interface CartState {
  lines: CartLine[]
  held: CartLine[][]
  add: (m: MenuItem) => void
  setQty: (i: number, qty: number) => void
  changeQty: (i: number, d: number) => void
  clear: () => void
  hold: () => void
  recall: (i: number) => void
}

export const useCart = create<CartState>((set) => ({
  lines: [],
  held: [],
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
  clear: () => set({ lines: [] }),
  hold: () => set((s) => (s.lines.length ? { held: [...s.held, s.lines], lines: [] } : s)),
  recall: (i) => set((s) => ({ lines: s.held[i], held: s.held.filter((_, j) => j !== i) })),
}))

import { useEffect, useState } from 'react'
import { useCart } from '../state/cart'

interface Totals {
  subtotal: number
  discount: number
  tax: number
  total: number
}

export function PayModal({ onClose }: { onClose: () => void }) {
  const { lines, clear } = useCart()
  const [totals, setTotals] = useState<Totals | null>(null)
  const [tender, setTender] = useState(0)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const pl = lines.map((l) => ({ price: l.price, qty: l.qty, taxRate: l.taxable ? l.tax_rate / 100 : 0 }))
    window.pos.price(pl, null).then(setTotals)
  }, [lines])

  if (!totals) return null
  const change = Math.max(0, tender - totals.total)

  async function submit(method: 'cash' | 'card') {
    if (!totals) return
    setBusy(true)
    const paidTender = method === 'card' ? totals.total : tender
    const paidChange = method === 'card' ? 0 : change
    try {
      const { token } = await window.pos.commit({
        items: lines.map((l) => ({
          product_id: l.product_id,
          name: l.name,
          price: l.price,
          qty: l.qty,
          station: l.station,
          modifiers: l.modifiers,
        })),
        totals: { ...totals, tender: paidTender, change: paidChange },
        paymentMethod: method,
      })
      alert(`Order #${token} sent to kitchen.${method === 'cash' ? ` Change $${paidChange.toFixed(2)}` : ''}`)
      clear()
      onClose()
    } catch (e) {
      alert(`Failed: ${(e as Error)?.message ?? e}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0007', display: 'grid', placeItems: 'center' }}>
      <div style={{ background: '#fff', padding: 24, borderRadius: 14, minWidth: 340 }}>
        <h2 style={{ margin: '0 0 8px' }}>Total ${totals.total.toFixed(2)}</h2>
        <div style={{ color: '#666', marginBottom: 12 }}>Tax ${totals.tax.toFixed(2)}</div>
        <input
          type="number"
          inputMode="decimal"
          placeholder="Cash tendered"
          value={tender || ''}
          onChange={(e) => setTender(Number(e.target.value))}
          autoFocus
          style={{ width: '100%', fontSize: 20, padding: 10, marginBottom: 8 }}
        />
        <div style={{ fontSize: 18, marginBottom: 16 }}>Change ${change.toFixed(2)}</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <button onClick={onClose} style={{ flex: 1, height: 48, borderRadius: 8, border: '1px solid #ccc', background: '#fff' }}>
            Cancel
          </button>
          <button
            disabled={busy || tender < totals.total}
            onClick={() => submit('cash')}
            style={{ flex: 2, height: 48, borderRadius: 8, border: 'none', background: '#111', color: '#fff', fontWeight: 700 }}
          >
            {busy ? '…' : 'Cash'}
          </button>
        </div>
        <button
          disabled={busy}
          onClick={() => submit('card')}
          style={{ width: '100%', height: 48, borderRadius: 8, border: '1px solid #111', background: '#fff', fontWeight: 700 }}
        >
          Card (terminal)
        </button>
      </div>
    </div>
  )
}

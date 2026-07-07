import { useEffect, useState } from 'react'
import { useCart } from '../state/cart'

interface Totals {
  subtotal: number
  discount: number
  tax: number
  total: number
}

export function PayModal({ onClose }: { onClose: () => void }) {
  const { lines, orderType, discount, note, clear } = useCart()
  const [totals, setTotals] = useState<Totals | null>(null)
  const [tender, setTender] = useState(0)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const pl = lines.map((l) => ({ price: l.price, qty: l.qty, taxRate: l.taxable ? l.tax_rate / 100 : 0 }))
    window.pos.price(pl, discount).then(setTotals)
  }, [lines, discount])

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
        orderType,
        note,
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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Total ${totals.total.toFixed(2)}</h2>
        <div style={{ color: 'var(--vt-text-2)', marginBottom: 12 }}>
          {orderType.replace('_', '-')} · Subtotal ${totals.subtotal.toFixed(2)}
          {totals.discount ? ` · Disc −$${totals.discount.toFixed(2)}` : ''} · Tax ${totals.tax.toFixed(2)}
        </div>
        <input
          className="pay-input"
          type="number"
          inputMode="decimal"
          placeholder="Cash tendered"
          value={tender || ''}
          onChange={(e) => setTender(Number(e.target.value))}
          autoFocus
        />
        <div style={{ fontSize: 18, marginBottom: 16, color: 'var(--vt-ink)' }}>Change ${change.toFixed(2)}</div>
        <div className="btn-row" style={{ marginBottom: 8 }}>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-pay" style={{ flex: 2 }} disabled={busy || tender < totals.total} onClick={() => submit('cash')}>
            {busy ? '…' : 'Cash'}
          </button>
        </div>
        <button className="btn btn-theme" style={{ width: '100%' }} disabled={busy} onClick={() => submit('card')}>
          Card (terminal)
        </button>
      </div>
    </div>
  )
}

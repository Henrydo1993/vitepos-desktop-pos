import { useEffect, useState } from 'react'
import { useCart } from '../state/cart'
import { Numpad } from './Numpad'

interface Totals {
  subtotal: number
  discount: number
  tax: number
  total: number
}

const money = (n: number) => (Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`)

export function PayModal({ onClose }: { onClose: () => void }) {
  const { lines, orderType, discount, note, customer, clear } = useCart()
  const [totals, setTotals] = useState<Totals | null>(null)
  const [tenderStr, setTenderStr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const pl = lines.map((l) => ({ price: l.price, qty: l.qty, taxRate: l.taxable ? l.tax_rate / 100 : 0 }))
    window.pos.price(pl, discount).then(setTotals)
  }, [lines, discount])

  if (!totals) return null
  const total = totals.total
  const tender = Number(tenderStr) || 0
  const change = Math.max(0, tender - total)
  const remaining = Math.max(0, total - tender)
  const enough = tender >= total

  // Exact + a few sensible cash notes at or above the total.
  const quick = [...new Set([total, Math.ceil(total / 5) * 5, Math.ceil(total / 10) * 10, 50, 100].map((v) => Math.round(v * 100) / 100))]
    .filter((v) => v >= total)
    .slice(0, 4)

  async function submit(method: 'cash' | 'card') {
    if (!totals) return
    setBusy(true)
    const paidTender = method === 'card' ? total : tender
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
        customerId: customer?.id,
        customerName: customer?.name,
      })
      clear()
      onClose()
      // brief confirm without blocking the next order
      setTimeout(() => alert(`Order #${token} sent to kitchen.${method === 'cash' && paidChange ? `  Change ${money(paidChange)}` : ''}`), 0)
    } catch (e) {
      alert(`Failed: ${(e as Error)?.message ?? e}`)
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet pay-sheet" onClick={(e) => e.stopPropagation()}>
        <style>{PAY_CSS}</style>

        <div className="pay-head">
          <div>
            <div className="pay-total-label">Total due</div>
            <div className="pay-total">{money(total)}</div>
          </div>
          <button type="button" className="pay-x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="pay-meta">
          {orderType.replace('_', '-')} · Subtotal ${totals.subtotal.toFixed(2)}
          {totals.discount ? ` · Disc −$${totals.discount.toFixed(2)}` : ''} · Tax ${totals.tax.toFixed(2)}
        </div>

        <div className="pay-readout">
          <span className="pay-readout-label">Cash received</span>
          <span className="pay-readout-val">${tender.toFixed(2)}</span>
        </div>
        <div className={`pay-change ${enough && change > 0 ? 'ok' : ''}`}>
          {enough ? (
            <>
              Change <b>{money(change)}</b>
            </>
          ) : (
            <>
              Remaining <b>{money(remaining)}</b>
            </>
          )}
        </div>

        <div className="pay-quick">
          {quick.map((q) => (
            <button type="button" key={q} className="pay-chip" onClick={() => setTenderStr(String(q))}>
              {q === total ? 'Exact' : money(q)}
            </button>
          ))}
        </div>

        <Numpad value={tenderStr} onChange={setTenderStr} />

        <div className="pay-actions">
          <button type="button" className="pay-btn ghost" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="pay-btn cash" disabled={busy || !enough} onClick={() => submit('cash')}>
            {busy ? '…' : 'Cash'}
          </button>
          <button type="button" className="pay-btn card" disabled={busy} onClick={() => submit('card')}>
            Card
          </button>
        </div>
      </div>
    </div>
  )
}

const PAY_CSS = `
.pay-sheet{width:420px;max-width:94vw;max-height:94vh;overflow:auto}
.pay-head{display:flex;align-items:flex-start;justify-content:space-between}
.pay-total-label{font-size:13px;color:var(--vt-text-2,#6b7280);font-weight:600}
.pay-total{font-size:38px;font-weight:800;line-height:1.05;color:var(--vt-ink,#0f172a)}
.pay-x{width:38px;height:38px;border:none;border-radius:10px;background:#f2f4f8;font-size:16px;color:#6b7280;cursor:pointer}
.pay-x:active{background:#e5e8ee}
.pay-meta{font-size:12.5px;color:var(--vt-text-2,#6b7280);margin:2px 0 14px}
.pay-readout{display:flex;align-items:baseline;justify-content:space-between;background:#f6f8fb;
 border:1px solid var(--vt-border,#e5e8ee);border-radius:12px;padding:12px 14px}
.pay-readout-label{font-size:13px;color:var(--vt-text-2,#6b7280);font-weight:600}
.pay-readout-val{font-size:26px;font-weight:800;color:var(--vt-ink,#0f172a);font-variant-numeric:tabular-nums}
.pay-change{text-align:right;font-size:14px;color:var(--vt-text-2,#6b7280);margin:8px 2px 12px}
.pay-change b{font-size:18px;color:var(--vt-ink,#0f172a);margin-left:4px}
.pay-change.ok b{color:#0a8a3f}
.pay-quick{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px}
.pay-chip{height:44px;border:1px solid var(--vt-border,#d7dbe2);border-radius:10px;background:#fff;
 font-size:15px;font-weight:700;color:var(--vt-ink,#1f2430);cursor:pointer}
.pay-chip:active{background:#eef1f6}
.pay-actions{display:flex;gap:8px;margin-top:14px}
.pay-btn{flex:1;height:56px;border:none;border-radius:12px;font-size:17px;font-weight:700;cursor:pointer}
.pay-btn:disabled{opacity:.45;cursor:default}
.pay-btn.ghost{flex:.7;background:#f2f4f8;color:#4b5563}
.pay-btn.cash{flex:1.6;background:#0a8a3f;color:#fff}
.pay-btn.card{background:#0a296d;color:#fff}
`

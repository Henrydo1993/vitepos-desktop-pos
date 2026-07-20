import { useEffect, useState } from 'react'
import { useAuth, canVoid } from '../state/auth'

interface Row {
  id: number
  token: number
  total: number
  payment_method: string
  order_type: string
  table_label: string | null
  customer_name: string | null
  staff_name: string | null
  voided: number
  synced: number
  sync_error: string | null
  created_at: string
}

type OrderDetail = NonNullable<Awaited<ReturnType<Window['pos']['orderGet']>>>

const time = (iso: string) => new Date(iso).toLocaleString('en-AU', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })

// Where the order was for — the table for dine-in, otherwise the order type.
const TYPE_LABEL: Record<string, string> = { table: 'Dine-in', takeaway: 'Takeaway', walk_in: 'Walk-in', delivery: 'Delivery' }
const placeText = (o: { order_type?: string | null; table_label?: string | null }) => {
  const t = (o.order_type || '').toLowerCase()
  if (t === 'table') return o.table_label || 'Dine-in'
  return TYPE_LABEL[t] || (o.order_type || '—').replace('_', '-')
}
const placeIcon = (o: { order_type?: string | null; table_label?: string | null }) => {
  const t = (o.order_type || '').toLowerCase()
  return t === 'table' ? '🍽' : t === 'delivery' ? '🛵' : t === 'walk_in' ? '🚶' : '🥡'
}

const PAY_METHODS = [
  { k: 'cash', label: 'Cash' },
  { k: 'card', label: 'Swipe Machine' },
  { k: 'bank', label: 'Bank Transfer' },
  { k: 'other', label: 'Other' },
]

export function OrdersView() {
  const staff = useAuth((s) => s.staff)
  const [scope, setScope] = useState<'today' | 'all'>('today')
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [syncing, setSyncing] = useState(false)
  const [payFor, setPayFor] = useState<number | null>(null)
  const [detail, setDetail] = useState<OrderDetail | null>(null)

  const openDetail = async (id: number) => {
    const d = await window.pos.orderGet(id)
    if (d) setDetail(d)
  }

  const load = () => window.pos.ordersList({ scope, q }).then(setRows)
  useEffect(() => {
    const t = setTimeout(load, 200)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, q])

  const reprint = (id: number) => window.pos.reprint(id)
  const voidOrder = async (id: number) => {
    const reason = prompt('Void reason?')
    if (reason == null) return
    await window.pos.voidOrder(id, reason)
    load()
  }
  const changePayment = async (id: number, method: string) => {
    await window.pos.setPayment(id, method)
    setPayFor(null)
    load()
  }

  return (
    <div className="ov">
      <style>{OV_CSS}</style>
      <div className="ov-head">
        <h2>Orders</h2>
        <div className="ov-seg">
          <button className={scope === 'today' ? 'on' : ''} onClick={() => setScope('today')}>Today</button>
          <button className={scope === 'all' ? 'on' : ''} onClick={() => setScope('all')}>All</button>
        </div>
        <input className="ov-search" placeholder="Search #token / customer / staff…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button
          className="ov-refresh"
          disabled={syncing}
          onClick={async () => {
            setSyncing(true)
            try {
              await window.pos.syncRefresh()
            } finally {
              setSyncing(false)
              load()
            }
          }}
        >
          {syncing ? 'Syncing…' : '↻ Sync store'}
        </button>
      </div>
      <div className="ov-body">
        <div className="ov-table">
          <div className="ov-tr ov-th">
            <span>#</span><span>Time</span><span>Type</span><span>Customer</span><span>Staff</span><span>Pay</span><span className="r">Total</span><span></span>
          </div>
          {rows.length === 0 && <div className="ov-none">No orders.</div>}
          {rows.map((o) => (
            <div className={`ov-tr ov-click${o.voided ? ' void' : ''}`} key={o.id} onClick={() => openDetail(o.id)} title="View items">
              <span className="b">#{o.token}</span>
              <span>{time(o.created_at)}</span>
              <span className="cap">{placeIcon(o)} {placeText(o)}</span>
              <span className="ell">{o.customer_name || '—'}</span>
              <span className="ell">{o.staff_name || '—'}</span>
              <span className="cap">{o.payment_method}</span>
              <span className="r b">${o.total.toFixed(2)}{o.voided ? ' ·VOID' : ''}</span>
              <span className="acts" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => reprint(o.id)}>Reprint</button>
                {!o.voided && canVoid(staff) && <button onClick={() => setPayFor(o.id)}>Method</button>}
                {!o.voided && canVoid(staff) && <button className="del" onClick={() => voidOrder(o.id)}>Void</button>}
              </span>
            </div>
          ))}
        </div>
      </div>
      {payFor != null && (
        <div className="modal-overlay" onClick={() => setPayFor(null)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()} style={{ width: 320 }}>
            <h3 className="modal-title">Change payment method</h3>
            <div style={{ display: 'grid', gap: 8 }}>
              {PAY_METHODS.map((m) => (
                <button key={m.k} className="btn" onClick={() => changePayment(payFor, m.k)}>
                  {m.label}
                </button>
              ))}
            </div>
            <button className="btn" style={{ marginTop: 10, width: '100%' }} onClick={() => setPayFor(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {detail && (
        <div className="modal-overlay" onClick={() => setDetail(null)}>
          <div className="modal-sheet ovd" onClick={(e) => e.stopPropagation()}>
            <div className="ovd-head">
              <div>
                <h3 className="modal-title" style={{ margin: 0 }}>Order #{detail.token}</h3>
                <div className="ovd-sub">
                  {time(detail.created_at)} · {detail.staff_name || '—'}
                  {detail.customer_name ? ` · ${detail.customer_name}` : ''}
                </div>
              </div>
              <button className="ovd-x" onClick={() => setDetail(null)} aria-label="Close">✕</button>
            </div>
            <div className={`ovd-where${(detail.order_type || '').toLowerCase() === 'table' ? ' dinein' : ''}`}>
              <span className="ovd-where-i">{placeIcon(detail)}</span>
              {placeText(detail)}
            </div>
            {detail.voided ? <div className="ovd-void">VOIDED{detail.void_reason ? ` — ${detail.void_reason}` : ''}</div> : null}
            <div className="ovd-items">
              {detail.items.length === 0 && <div className="ovd-empty">No item detail saved for this order.</div>}
              {detail.items.map((it, i) => (
                <div className="ovd-item" key={i}>
                  <span className="ovd-q">{it.qty}×</span>
                  <span className="ovd-n">
                    {it.name}
                    {it.modifiers && it.modifiers.length ? <span className="ovd-mods">{it.modifiers.join(', ')}</span> : null}
                  </span>
                  <span className="ovd-p">${(it.price * it.qty).toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="ovd-tot">
              <div><span>Subtotal</span><span>${detail.subtotal.toFixed(2)}</span></div>
              {detail.discount ? <div><span>Discount</span><span>−${detail.discount.toFixed(2)}</span></div> : null}
              {detail.fee ? <div><span>Fee</span><span>${detail.fee.toFixed(2)}</span></div> : null}
              {detail.tax ? <div><span>Tax</span><span>${detail.tax.toFixed(2)}</span></div> : null}
              <div className="ovd-grand"><span>Total</span><span>${detail.total.toFixed(2)}</span></div>
              <div className="ovd-pay">
                <span className="cap">{detail.payment_method}</span>
                <span>Tendered ${detail.tender.toFixed(2)} · Change ${detail.change.toFixed(2)}</span>
              </div>
            </div>
            {detail.note ? <div className="ovd-note">Note: {detail.note}</div> : null}
            <div className="ovd-acts">
              <button className="btn" onClick={() => reprint(detail.id)}>Reprint receipt</button>
              <button className="btn ovd-close" onClick={() => setDetail(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const OV_CSS = `
.ov{display:flex;flex-direction:column;height:100%;background:var(--vt-panel-bg,#f4f6fa);overflow:hidden}
.ov-head{display:flex;align-items:center;gap:14px;padding:14px 22px;background:#fff;border-bottom:1px solid #eef1f5}
.ov-head h2{font-size:20px;font-weight:800;color:#0f172a;margin:0}
.ov-seg{display:flex;border:1px solid var(--vt-border,#e5e8ee);border-radius:9px;overflow:hidden}
.ov-seg button{border:none;background:#fff;padding:8px 16px;font-weight:700;font-size:13px;color:#64748b;cursor:pointer}
.ov-seg button.on{background:var(--vt-main,#1e3a8a);color:#fff}
.ov-search{flex:1;max-width:360px;height:40px;border:1px solid var(--vt-border,#e5e8ee);border-radius:9px;padding:0 14px;font-size:15px}
.ov-refresh{height:40px;border:1px solid var(--vt-main,#1e3a8a);background:var(--vt-main,#1e3a8a);color:#fff;border-radius:9px;padding:0 16px;font-weight:700;font-size:14px;cursor:pointer;white-space:nowrap}
.ov-refresh:disabled{opacity:.6;cursor:default}
.ov-body{flex:1;overflow:auto;padding:14px 22px}
.ov-table{background:#fff;border:1px solid #eef1f5;border-radius:12px;overflow:hidden}
.ov-tr{display:grid;grid-template-columns:64px 132px 90px 1fr 100px 90px 110px 150px;align-items:center;gap:10px;padding:11px 16px;border-top:1px solid #f2f4f7;font-size:14px;color:#0f172a}
.ov-th{border-top:none;background:#f8fafc;font-size:12px;font-weight:800;color:#6b7280;text-transform:uppercase;letter-spacing:.4px}
.ov-tr.void{opacity:.5}
.ov-tr .b{font-weight:700}
.ov-tr .r{text-align:right}
.ov-tr .cap{text-transform:capitalize;color:#475569}
.ov-tr .ell{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ov-none{padding:30px;text-align:center;color:#9aa1ab}
.acts{display:flex;gap:6px;justify-content:flex-end}
.acts button{border:1px solid var(--vt-border,#e5e8ee);background:#fff;border-radius:8px;padding:6px 10px;font-size:12.5px;font-weight:600;cursor:pointer;color:#334155}
.acts button.del{color:#e0405a;border-color:rgba(224,64,90,.35)}
.ov-click{cursor:pointer}
.ov-click:hover{background:#f8fafc}
.ovd{width:440px;max-width:94vw;max-height:88vh;display:flex;flex-direction:column;padding:18px}
.ovd-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
.ovd-sub{font-size:12.5px;color:#64748b;margin-top:3px;text-transform:capitalize}
.ovd-where{display:inline-flex;align-items:center;gap:8px;align-self:flex-start;margin:12px 0 2px;background:#eef1f6;color:#334155;font-weight:800;font-size:16px;padding:9px 16px;border-radius:10px}
.ovd-where.dinein{background:#e7f1ff;color:var(--vt-main,#1e3a8a)}
.ovd-where-i{font-size:18px;line-height:1}
.ovd-x{border:none;background:#f1f5f9;width:30px;height:30px;border-radius:8px;font-size:15px;cursor:pointer;color:#475569;flex:0 0 auto}
.ovd-void{margin-top:10px;background:#fee2e2;color:#b91c1c;font-weight:800;font-size:12.5px;padding:6px 10px;border-radius:8px;letter-spacing:.4px}
.ovd-items{margin-top:12px;overflow:auto;border:1px solid #eef1f5;border-radius:10px}
.ovd-item{display:grid;grid-template-columns:38px 1fr auto;align-items:baseline;gap:8px;padding:9px 12px;border-top:1px solid #f2f4f7;font-size:14px}
.ovd-item:first-child{border-top:none}
.ovd-q{font-weight:800;color:#0f172a}
.ovd-n{color:#0f172a}
.ovd-mods{display:block;font-size:12px;color:#7c8698;margin-top:1px}
.ovd-p{font-weight:700;color:#0f172a;white-space:nowrap}
.ovd-empty{padding:16px;text-align:center;color:#9aa1ab;font-size:13px}
.ovd-tot{margin-top:12px;font-size:13.5px;color:#475569}
.ovd-tot>div{display:flex;justify-content:space-between;padding:3px 2px}
.ovd-grand{font-weight:800;color:#0f172a;font-size:16px;border-top:1px solid #eef1f5;margin-top:4px;padding-top:8px!important}
.ovd-pay{color:#64748b;font-size:12.5px;margin-top:2px}
.ovd-note{margin-top:10px;background:#fff8e6;border:1px solid #f6e4b0;color:#8a6d20;font-size:13px;padding:8px 10px;border-radius:8px}
.ovd-acts{display:flex;gap:8px;margin-top:16px}
.ovd-acts .btn{flex:1}
.ovd-acts .ovd-close{background:var(--vt-main,#1e3a8a);color:#fff;border-color:var(--vt-main,#1e3a8a)}
`

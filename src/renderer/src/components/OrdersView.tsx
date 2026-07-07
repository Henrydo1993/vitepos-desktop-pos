import { useEffect, useState } from 'react'

interface Row {
  id: number
  token: number
  total: number
  payment_method: string
  order_type: string
  customer_name: string | null
  staff_name: string | null
  voided: number
  synced: number
  sync_error: string | null
  created_at: string
}

const time = (iso: string) => new Date(iso).toLocaleString('en-AU', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })

export function OrdersView() {
  const [scope, setScope] = useState<'today' | 'all'>('today')
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [syncing, setSyncing] = useState(false)

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
            <div className={`ov-tr${o.voided ? ' void' : ''}`} key={o.id}>
              <span className="b">#{o.token}</span>
              <span>{time(o.created_at)}</span>
              <span className="cap">{(o.order_type || '').replace('_', '-')}</span>
              <span className="ell">{o.customer_name || '—'}</span>
              <span className="ell">{o.staff_name || '—'}</span>
              <span className="cap">{o.payment_method}</span>
              <span className="r b">${o.total.toFixed(2)}{o.voided ? ' ·VOID' : ''}</span>
              <span className="acts">
                <button onClick={() => reprint(o.id)}>Reprint</button>
                {!o.voided && <button className="del" onClick={() => voidOrder(o.id)}>Void</button>}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const OV_CSS = `
.ov{display:flex;flex-direction:column;height:100%;background:var(--vt-panel-bg,#f4f6fa);overflow:hidden}
.ov-head{display:flex;align-items:center;gap:14px;padding:14px 22px;background:#fff;border-bottom:1px solid #eef1f5}
.ov-head h2{font-size:20px;font-weight:800;color:#0f172a;margin:0}
.ov-seg{display:flex;border:1px solid var(--vt-border,#e5e8ee);border-radius:9px;overflow:hidden}
.ov-seg button{border:none;background:#fff;padding:8px 16px;font-weight:700;font-size:13px;color:#64748b;cursor:pointer}
.ov-seg button.on{background:var(--vt-main,#2563eb);color:#fff}
.ov-search{flex:1;max-width:360px;height:40px;border:1px solid var(--vt-border,#e5e8ee);border-radius:9px;padding:0 14px;font-size:15px}
.ov-refresh{height:40px;border:1px solid var(--vt-main,#2563eb);background:var(--vt-main,#2563eb);color:#fff;border-radius:9px;padding:0 16px;font-weight:700;font-size:14px;cursor:pointer;white-space:nowrap}
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
`

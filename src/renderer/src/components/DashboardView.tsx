import { useEffect, useState } from 'react'
import { ShiftModal } from './ShiftModal'

interface Dash {
  orders: number
  gross: number
  byMethod: { method: string; n: number; amt: number }[]
  top: { name: string; qty: number; amt: number }[]
  byStaff: { staff: string; n: number; amt: number }[]
}

export function DashboardView() {
  const [d, setD] = useState<Dash | null>(null)
  const [shift, setShift] = useState<Shift | null>(null)
  const [modal, setModal] = useState<'open' | 'close' | null>(null)
  const [days, setDays] = useState<
    { id: number; openedAt: string; closedAt: string | null; orders: number; gross: number; openingFloat: number; countedCash: number | null }[]
  >([])
  const [flash, setFlash] = useState('')
  const [reprinting, setReprinting] = useState<number | null>(null)
  useEffect(() => {
    const load = () => {
      window.pos.dashToday().then(setD)
      window.pos.shiftCurrent().then(setShift)
      window.pos.shiftList().then(setDays)
    }
    load()
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [])

  const today = new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })

  const reprint = async (id: number) => {
    setReprinting(id)
    const r = await window.pos.shiftReport(id)
    setReprinting(null)
    setFlash(r.printed ? 'Report sent to the counter printer.' : 'No counter printer is set — nothing printed.')
    setTimeout(() => setFlash(''), 3500)
  }

  return (
    <div className="dv">
      <style>{DV_CSS}</style>
      <div className="dv-head">
        <h2>Dashboard</h2>
        <span className="dv-date">{today}</span>
      </div>
      {!d ? (
        <div className="dv-empty">Loading…</div>
      ) : (
        <div className="dv-body">
          <div className="dv-shift">
            {shift ? (
              <span>
                <b>Day open</b> · started {new Date(shift.opened_at).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })} · float ${shift.opening_float.toFixed(2)}
              </span>
            ) : (
              <span>
                <b>Day not started</b> · set your opening cash to begin
              </span>
            )}
            <button className="btn btn-theme" onClick={() => setModal(shift ? 'close' : 'open')}>
              {shift ? 'End of day' : 'Start day'}
            </button>
          </div>
          <div className="dv-stats">
            <div className="dv-stat big">
              <div className="dv-lbl">Sales today</div>
              <div className="dv-val">${d.gross.toFixed(2)}</div>
            </div>
            <div className="dv-stat">
              <div className="dv-lbl">Orders</div>
              <div className="dv-val">{d.orders}</div>
            </div>
            <div className="dv-stat">
              <div className="dv-lbl">Avg order</div>
              <div className="dv-val">${d.orders ? (d.gross / d.orders).toFixed(2) : '0.00'}</div>
            </div>
          </div>

          <div className="dv-cols">
            <div className="dv-card">
              <h3>By payment method</h3>
              {d.byMethod.length === 0 && <div className="dv-none">No sales yet today.</div>}
              {d.byMethod.map((m) => (
                <div className="dv-row" key={m.method}>
                  <span className="dv-cap">{m.method}</span>
                  <span className="dv-sub">{m.n}</span>
                  <b>${m.amt.toFixed(2)}</b>
                </div>
              ))}
            </div>

            <div className="dv-card">
              <h3>Top sellers</h3>
              {d.top.length === 0 && <div className="dv-none">—</div>}
              {d.top.map((t) => (
                <div className="dv-row" key={t.name}>
                  <span className="dv-name">{t.name}</span>
                  <span className="dv-sub">×{t.qty}</span>
                  <b>${t.amt.toFixed(2)}</b>
                </div>
              ))}
            </div>

            <div className="dv-card">
              <h3>By staff</h3>
              {d.byStaff.length === 0 && <div className="dv-none">—</div>}
              {d.byStaff.map((s) => (
                <div className="dv-row" key={s.staff}>
                  <span className="dv-name">{s.staff}</span>
                  <span className="dv-sub">{s.n}</span>
                  <b>${s.amt.toFixed(2)}</b>
                </div>
              ))}
            </div>

            <div className="dv-card">
              <h3>Reprint a day</h3>
              {days.length === 0 && <div className="dv-none">No closed days yet.</div>}
              {days.map((day) => (
                <div className="dv-row" key={day.id}>
                  <span className="dv-name">
                    {new Date(day.closedAt || day.openedAt).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </span>
                  <span className="dv-sub">${day.gross.toFixed(2)}</span>
                  <button className="btn btn-sm" style={{ marginLeft: 10 }} onClick={() => reprint(day.id)} disabled={reprinting !== null}>
                    {reprinting === day.id ? '…' : 'Reprint'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {modal && (
        <ShiftModal
          mode={modal}
          onClose={() => setModal(null)}
          onDone={() => {
            setModal(null)
            window.pos.shiftCurrent().then(setShift)
            window.pos.dashToday().then(setD)
            window.pos.shiftList().then(setDays)
          }}
        />
      )}
      {flash && <div className="dv-toast">{flash}</div>}
    </div>
  )
}

const DV_CSS = `
.dv{display:flex;flex-direction:column;height:100%;background:var(--vt-panel-bg,#f4f6fa);overflow:hidden}
.dv-shift{display:flex;justify-content:space-between;align-items:center;gap:12px;background:#fff;border:1px solid #eef1f5;border-radius:14px;padding:14px 18px;margin-bottom:16px;font-size:14px;color:#334155}
.dv-toast{position:fixed;bottom:22px;right:22px;background:#0f172a;color:#fff;padding:12px 18px;border-radius:10px;font-weight:600;box-shadow:0 10px 26px rgba(0,0,0,.25);z-index:60}
.dv-head{display:flex;align-items:baseline;gap:14px;padding:16px 22px;background:#fff;border-bottom:1px solid #eef1f5}
.dv-head h2{font-size:20px;font-weight:800;color:#0f172a;margin:0}
.dv-date{color:#6b7280;font-size:14px}
.dv-body{flex:1;overflow:auto;padding:20px 22px}
.dv-empty{padding:40px;color:#6b7280}
.dv-stats{display:grid;grid-template-columns:2fr 1fr 1fr;gap:14px;margin-bottom:18px}
.dv-stat{background:#fff;border:1px solid #eef1f5;border-radius:14px;padding:18px 20px}
.dv-stat.big{background:linear-gradient(135deg,#2563eb,#1e40af);color:#fff;border:none}
.dv-lbl{font-size:13px;opacity:.75;font-weight:600;margin-bottom:6px}
.dv-val{font-size:32px;font-weight:800;font-variant-numeric:tabular-nums}
.dv-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px}
.dv-card{background:#fff;border:1px solid #eef1f5;border-radius:14px;padding:16px 18px}
.dv-card h3{font-size:14px;font-weight:800;color:#334155;margin:0 0 10px;text-transform:uppercase;letter-spacing:.4px}
.dv-none{color:#9aa1ab;font-size:14px}
.dv-row{display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid #f2f4f7}
.dv-row:first-of-type{border-top:none}
.dv-cap{text-transform:capitalize;color:#0f172a;font-weight:600}
.dv-name{flex:1;min-width:0;color:#0f172a;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dv-sub{color:#6b7280;font-size:13px;margin-left:auto}
.dv-row b{color:#0f172a;font-variant-numeric:tabular-nums;min-width:70px;text-align:right}
.dv-cap{flex:1}
`

import { useEffect, useState } from 'react'

export interface TableRow {
  label: string
  area?: string
  seats?: number
  open: { id: number; items: number; total: number; updatedAt: string } | null
}

interface PendingRow {
  label: string
  type: string
  open: { id: number; items: number; total: number; updatedAt: string }
}

const ago = (iso: string) => {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m`
  return `${Math.floor(min / 60)}h ${min % 60}m`
}
const typeLabel = (t: string) => (t === 'walk_in' ? 'Walk-in' : t === 'delivery' ? 'Delivery' : 'Take-away')

export function TablesView({ onOpen }: { onOpen: (t: TableRow) => void }) {
  const [tables, setTables] = useState<TableRow[]>([])
  const [pending, setPending] = useState<PendingRow[]>([])
  useEffect(() => {
    const load = () => window.pos.tablesList().then((d) => {
      setTables(d.tables)
      setPending(d.pending)
    })
    load()
    const t = setInterval(load, 15000)
    return () => clearInterval(t)
  }, [])

  const occ = tables.filter((t) => t.open).length

  return (
    <div className="tv">
      <style>{TV_CSS}</style>
      <div className="tv-head">
        <h2>Tables</h2>
        <span className="tv-sub">
          {occ} occupied · {tables.length - occ} free
        </span>
      </div>
      <div className="tv-body">
        {pending.length > 0 && (
          <section className="tv-sec">
            <h3 className="tv-sec-h">Take-away &amp; Walk-in · waiting to pay</h3>
            <div className="tv-grid">
              {pending.map((p) => (
                <button key={p.open.id} type="button" className="tv-table occ tv-away" onClick={() => onOpen({ label: p.label, area: typeLabel(p.type), open: p.open })}>
                  <div className="tv-label">{p.label}</div>
                  <div className="tv-area">{typeLabel(p.type)}</div>
                  <div className="tv-total">${p.open.total.toFixed(2)}</div>
                  <div className="tv-meta">
                    {p.open.items} item{p.open.items === 1 ? '' : 's'} · {ago(p.open.updatedAt)}
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}
        <section className="tv-sec">
          {pending.length > 0 && <h3 className="tv-sec-h">Tables</h3>}
          <div className="tv-grid">
            {tables.map((t) => (
              <button key={t.label} type="button" className={`tv-table${t.open ? ' occ' : ''}`} onClick={() => onOpen(t)}>
                <div className="tv-label">{t.label}</div>
                {t.area && <div className="tv-area">{t.area}</div>}
                {t.open ? (
                  <>
                    <div className="tv-total">${t.open.total.toFixed(2)}</div>
                    <div className="tv-meta">
                      {t.open.items} item{t.open.items === 1 ? '' : 's'} · {ago(t.open.updatedAt)}
                    </div>
                  </>
                ) : (
                  <div className="tv-free">Free{t.seats ? ` · ${t.seats} seats` : ''}</div>
                )}
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

const TV_CSS = `
.tv{display:flex;flex-direction:column;height:100%;background:var(--vt-panel-bg,#f4f6fa);overflow:hidden}
.tv-head{display:flex;align-items:baseline;gap:14px;padding:16px 22px;background:#fff;border-bottom:1px solid #eef1f5}
.tv-head h2{font-size:20px;font-weight:800;color:#0f172a;margin:0}
.tv-sub{color:#6b7280;font-size:14px}
.tv-body{flex:1;overflow:auto;padding:20px 22px}
.tv-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px}
.tv-table{display:flex;flex-direction:column;align-items:flex-start;gap:4px;min-height:118px;padding:16px;border-radius:14px;
 border:1px solid #e5e8ee;background:#fff;cursor:pointer;text-align:left}
.tv-table:active{transform:translateY(1px)}
.tv-label{font-size:18px;font-weight:800;color:#0f172a}
.tv-area{font-size:12.5px;color:#6b7280;margin-top:-1px}
.tv-free{margin-top:auto;font-size:14px;font-weight:600;color:#9aa1ab}
.tv-table.occ{background:linear-gradient(135deg,#0a8a3f,#0b7a39);border-color:#0a8a3f;color:#fff}
.tv-table.occ .tv-label{color:#fff}
.tv-table.occ .tv-area{color:rgba(255,255,255,.82)}
.tv-total{margin-top:auto;font-size:22px;font-weight:800}
.tv-meta{font-size:12.5px;opacity:.85}
.tv-sec{margin-bottom:24px}
.tv-sec-h{font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:#6b7280;margin:0 0 12px}
.tv-table.tv-away{background:linear-gradient(135deg,#b45309,#92400e);border-color:#b45309}
`

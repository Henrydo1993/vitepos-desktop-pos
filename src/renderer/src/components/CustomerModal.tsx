import { useEffect, useState } from 'react'
import { useCart } from '../state/cart'

interface Row {
  id: number
  first_name?: string
  last_name?: string
  username?: string
  email?: string
  contact_no?: string
}
const label = (c: Row) => `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() || c.username || c.email || `#${c.id}`

export function CustomerModal({ onClose }: { onClose: () => void }) {
  const setCustomer = useCart((s) => s.setCustomer)
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [creating, setCreating] = useState(false)
  const [f, setF] = useState({ first_name: '', contact_no: '', email: '' })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => window.pos.searchCustomers(q).then(setRows), 250)
    return () => clearTimeout(t)
  }, [q])

  const pick = (c: Row) => {
    setCustomer({ id: Number(c.id), name: label(c) })
    onClose()
  }

  const create = async () => {
    setBusy(true)
    try {
      const res = await window.pos.createCustomer(f)
      const c = res?.data
      if (res?.ok && c?.id) pick({ id: Number(c.id), first_name: f.first_name, contact_no: f.contact_no })
      else alert('Could not create customer')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()} style={{ width: 420 }}>
        <h3 className="modal-title">Customer</h3>
        {!creating ? (
          <>
            <input
              className="pay-input"
              placeholder="Search name / phone / email…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoFocus
            />
            <div style={{ maxHeight: 300, overflow: 'auto', marginBottom: 10 }}>
              {rows.length === 0 && <div style={{ color: 'var(--vt-text-2)', padding: 8 }}>No matches.</div>}
              {rows.map((c) => (
                <button key={c.id} className="opt-row" onClick={() => pick(c)}>
                  <span>{label(c)}</span>
                  <span style={{ color: 'var(--vt-text-2)', fontSize: 13 }}>{c.contact_no || c.email}</span>
                </button>
              ))}
            </div>
            <div className="btn-row">
              <button className="btn" onClick={onClose}>
                Cancel
              </button>
              <button className="btn btn-theme" style={{ flex: 2 }} onClick={() => setCreating(true)}>
                + New customer
              </button>
            </div>
          </>
        ) : (
          <>
            <input className="pay-input" placeholder="Name" value={f.first_name} onChange={(e) => setF({ ...f, first_name: e.target.value })} autoFocus />
            <input className="pay-input" placeholder="Phone" value={f.contact_no} onChange={(e) => setF({ ...f, contact_no: e.target.value })} />
            <input className="pay-input" placeholder="Email (optional)" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
            <div className="btn-row">
              <button className="btn" onClick={() => setCreating(false)}>
                Back
              </button>
              <button className="btn btn-theme" style={{ flex: 2 }} disabled={busy || !f.first_name} onClick={create}>
                {busy ? '…' : 'Create & attach'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

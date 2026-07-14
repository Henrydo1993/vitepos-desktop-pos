import { useState } from 'react'
import type { Staff } from '../state/auth'
import { canManage } from '../state/auth'

export type View = 'pos' | 'tables' | 'dashboard' | 'orders'
const NAV: { key: View; label: string; ico: string }[] = [
  { key: 'pos', label: 'POS', ico: '🧾' },
  { key: 'tables', label: 'Tables', ico: '🍽️' },
  { key: 'dashboard', label: 'Dashboard', ico: '📊' },
  { key: 'orders', label: 'Orders', ico: '📋' },
]
const initials = (n: string) => n.trim().split(/\s+/).slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase() || '?'

export function Sidebar({
  view,
  onNav,
  onSettings,
  onLogout,
  staff,
  version,
}: {
  view: View
  onNav: (v: View) => void
  onSettings: () => void
  onLogout: () => void
  staff: Staff | null
  version?: string
}) {
  const [syncing, setSyncing] = useState(false)
  const [msg, setMsg] = useState('')
  const doSync = async () => {
    if (syncing) return
    setSyncing(true)
    try {
      const r = await window.pos.syncRefresh()
      window.dispatchEvent(new Event('pos:synced'))
      const bits = [`${r.products} products`]
      if (r.pushed) bits.push(`${r.pushed} sent`)
      if (r.productsRemoved) bits.push(`${r.productsRemoved} deleted`)
      if (r.removed) bits.push(`${r.removed} orders cleared`)
      setMsg('Synced · ' + bits.join(' · '))
    } catch {
      setMsg('Sync failed — check connection')
    } finally {
      setSyncing(false)
      setTimeout(() => setMsg(''), 4000)
    }
  }
  return (
    <div className="nav">
      {msg && <div className="sync-toast">{msg}</div>}
      <div className="logo">OPAL</div>
      {NAV.map((it) => (
        <button key={it.key} className={`nav-item${view === it.key ? ' active' : ''}`} onClick={() => onNav(it.key)}>
          <span className="ico">{it.ico}</span>
          <span>{it.label}</span>
        </button>
      ))}

      <div style={{ marginTop: 'auto' }} />
      <button className="nav-item" onClick={doSync} disabled={syncing} title="Pull products, tables & orders from the store now">
        <span className="ico" style={syncing ? { display: 'inline-block', animation: 'vspin .9s linear infinite' } : undefined}>
          🔄
        </span>
        <span>{syncing ? 'Syncing…' : 'Sync'}</span>
      </button>
      {staff && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '10px 4px', color: '#fff' }} title={staff.role}>
          <div
            style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(255,255,255,.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13 }}
          >
            {initials(staff.name)}
          </div>
          <span style={{ fontSize: 10.5, fontWeight: 600, textAlign: 'center', lineHeight: 1.1 }}>{staff.name}</span>
        </div>
      )}
      <button className="nav-item" onClick={onLogout}>
        <span className="ico">🔒</span>
        <span>Lock / Switch</span>
      </button>
      {canManage(staff) && (
        <button className="nav-item" onClick={onSettings}>
          <span className="ico">⚙️</span>
          <span>Settings</span>
        </button>
      )}
      {version && <div style={{ textAlign: 'center', fontSize: 10, opacity: 0.55, padding: '4px 0 8px' }}>v{version}</div>}
    </div>
  )
}

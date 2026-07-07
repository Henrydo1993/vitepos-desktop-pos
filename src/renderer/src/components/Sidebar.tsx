import type { Staff } from '../state/auth'

export type View = 'pos' | 'dashboard' | 'orders'
const NAV: { key: View; label: string; ico: string }[] = [
  { key: 'pos', label: 'POS', ico: '🧾' },
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
  return (
    <div className="nav">
      <div className="logo">OPAL</div>
      {NAV.map((it) => (
        <button key={it.key} className={`nav-item${view === it.key ? ' active' : ''}`} onClick={() => onNav(it.key)}>
          <span className="ico">{it.ico}</span>
          <span>{it.label}</span>
        </button>
      ))}

      <div style={{ marginTop: 'auto' }} />
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
      <button className="nav-item" onClick={onSettings}>
        <span className="ico">⚙️</span>
        <span>Settings</span>
      </button>
      {version && <div style={{ textAlign: 'center', fontSize: 10, opacity: 0.55, padding: '4px 0 8px' }}>v{version}</div>}
    </div>
  )
}

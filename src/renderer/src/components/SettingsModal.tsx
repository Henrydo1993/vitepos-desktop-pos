import { useEffect, useState } from 'react'

const toAddr = (v: string) => {
  const t = (v || '').trim()
  if (!t) return ''
  if (t.startsWith('tcp://')) return t
  return `tcp://${t}${t.includes(':') ? '' : ':9100'}`
}
const toIp = (v: string) => (v || '').replace(/^tcp:\/\//, '')

const lbl: React.CSSProperties = { display: 'block', fontSize: 13, color: 'var(--vt-text-2)', marginBottom: 4 }
const inp: React.CSSProperties = { width: '100%', fontSize: 16, padding: 11, border: '1px solid var(--vt-border)', borderRadius: 6, marginBottom: 12 }

export function SettingsModal({ onClose, firstRun }: { onClose: () => void; firstRun?: boolean }) {
  const [s, setS] = useState<Record<string, string> | null>(null)
  const [busy, setBusy] = useState(false)
  const [adv, setAdv] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    window.pos.getSettings().then((v) =>
      setS({ ...v, printer_counter: toIp(v.printer_counter), printer_kitchen: toIp(v.printer_kitchen), printer_bar: toIp(v.printer_bar) }),
    )
  }, [])

  if (!s) return null
  const set = (k: string, v: string) => setS((prev) => ({ ...(prev as Record<string, string>), [k]: v }))
  const canClose = !firstRun || !!s.app_password?.trim()

  const save = async () => {
    setBusy(true)
    setError('')
    try {
      await window.pos.saveSettings({
        ...s,
        printer_counter: toAddr(s.printer_counter),
        printer_kitchen: toAddr(s.printer_kitchen),
        printer_bar: toAddr(s.printer_bar),
      })
      const r = await window.pos.syncCatalog()
      if (r && r.products > 0) {
        // Reload so the product panel re-reads the freshly synced menu.
        window.location.reload()
        return
      }
      setError(
        'Connected, but no products loaded. Check the Application Password is correct, the store URL is right, and that products are set to show in POS.',
      )
      setBusy(false)
    } catch (e) {
      setError(`Couldn't reach the store: ${(e as Error)?.message ?? e}. Check the store website + Application Password.`)
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={canClose ? onClose : undefined}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()} style={{ width: 470, maxHeight: '92vh', overflow: 'auto' }}>
        <h2 className="modal-title">{firstRun ? 'Welcome — quick setup' : 'Settings'}</h2>
        {firstRun && (
          <p style={{ color: 'var(--vt-text-2)', marginTop: -8, marginBottom: 16 }}>
            Paste the Application Password we gave you and add your printer IPs. That's the whole setup.
          </p>
        )}

        <label style={lbl}>Application Password</label>
        <input style={inp} placeholder="xxxx xxxx xxxx xxxx xxxx xxxx" value={s.app_password ?? ''} onChange={(e) => set('app_password', e.target.value)} autoFocus />

        <div style={{ fontWeight: 700, color: 'var(--vt-ink)', margin: '10px 0 8px' }}>Printers (network IP)</div>
        <label style={lbl}>Counter / receipt printer</label>
        <input style={inp} placeholder="e.g. 192.168.1.50" value={s.printer_counter ?? ''} onChange={(e) => set('printer_counter', e.target.value)} />
        <label style={lbl}>Kitchen printer</label>
        <input style={inp} placeholder="e.g. 192.168.1.51" value={s.printer_kitchen ?? ''} onChange={(e) => set('printer_kitchen', e.target.value)} />
        <label style={lbl}>Bar printer</label>
        <input style={inp} placeholder="e.g. 192.168.1.52 (optional)" value={s.printer_bar ?? ''} onChange={(e) => set('printer_bar', e.target.value)} />

        <button className="btn btn-sm" style={{ marginBottom: 8 }} onClick={() => setAdv((a) => !a)}>
          {adv ? 'Hide' : 'Advanced'} connection
        </button>
        {adv && (
          <div style={{ background: 'var(--vt-panel-bg)', padding: 12, borderRadius: 8, marginBottom: 12 }}>
            <label style={lbl}>Store website</label>
            <input style={inp} value={s.base_url ?? ''} onChange={(e) => set('base_url', e.target.value)} />
            <label style={lbl}>POS user</label>
            <input style={inp} value={s.pos_user ?? ''} onChange={(e) => set('pos_user', e.target.value)} />
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={lbl}>Outlet ID</label>
                <input style={inp} value={s.outlet ?? ''} onChange={(e) => set('outlet', e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={lbl}>Counter ID</label>
                <input style={inp} value={s.counter ?? ''} onChange={(e) => set('counter', e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {error && (
          <div style={{ color: 'var(--vt-del)', fontSize: 13, marginBottom: 10, lineHeight: 1.4 }}>{error}</div>
        )}
        <div className="btn-row">
          {canClose && (
            <button className="btn" onClick={onClose} disabled={busy}>
              Cancel
            </button>
          )}
          <button className="btn btn-theme" style={{ flex: 2 }} disabled={busy || !s.app_password?.trim()} onClick={save}>
            {busy ? 'Saving…' : firstRun ? 'Save & start' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

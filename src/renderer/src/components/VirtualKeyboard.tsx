import { useEffect, useRef, useState } from 'react'

type Field = HTMLInputElement | HTMLTextAreaElement

// Only pop the keyboard for real text entry — skip readonly/disabled and anything
// opted out with data-no-kbd.
function isField(el: Element | null): el is Field {
  if (!el) return false
  if (el.hasAttribute('data-no-kbd')) return false
  if (el.tagName === 'TEXTAREA') {
    const t = el as HTMLTextAreaElement
    return !t.readOnly && !t.disabled
  }
  if (el.tagName !== 'INPUT') return false
  const i = el as HTMLInputElement
  const ok = ['text', 'search', 'tel', 'number', 'email', 'password', 'url', ''].includes(i.type)
  return ok && !i.readOnly && !i.disabled
}

// Write into a React-controlled input: set via the native setter, then fire `input`
// so React's onChange/state sees the change.
function setValue(el: Field, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  setter?.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

const ABC = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['⇧', 'z', 'x', 'c', 'v', 'b', 'n', 'm', '⌫'],
]
const SYM = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['@', '#', '$', '&', '*', '-', '+', '(', ')', '/'],
  ['!', '"', "'", ':', ';', ',', '?', '_', '='],
  ['%', '.', '~', '|', '\\', '<', '>', '[', ']', '⌫'],
]

export function VirtualKeyboard() {
  const [visible, setVisible] = useState(false)
  const [caps, setCaps] = useState(false)
  const [sym, setSym] = useState(false)
  const target = useRef<Field | null>(null)

  useEffect(() => {
    const onIn = (e: FocusEvent) => {
      const el = e.target as Element
      if (isField(el)) {
        target.current = el as Field
        setVisible(true)
        setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 60)
      }
    }
    // Hide only when focus truly leaves text entry (tapping keys keeps the input focused).
    const onOut = () =>
      setTimeout(() => {
        if (!isField(document.activeElement)) {
          setVisible(false)
          target.current = null
        }
      }, 150)
    document.addEventListener('focusin', onIn)
    document.addEventListener('focusout', onOut)
    return () => {
      document.removeEventListener('focusin', onIn)
      document.removeEventListener('focusout', onOut)
    }
  }, [])

  if (!visible) return null

  const tap = (k: string) => {
    const el = target.current
    if (!el) return
    if (k === '⌫') return setValue(el, el.value.slice(0, -1))
    if (k === '⇧') return setCaps((c) => !c)
    const ch = !sym && caps ? k.toUpperCase() : k
    setValue(el, el.value + ch)
  }

  const rows = sym ? SYM : ABC

  return (
    // Prevent mousedown from stealing focus so the target input stays active.
    <div className="vk" onMouseDown={(e) => e.preventDefault()}>
      <style>{VK_CSS}</style>
      {rows.map((row, i) => (
        <div className="vk-row" key={i}>
          {row.map((k) => (
            <button
              key={k}
              className={`vk-key${k === '⇧' && caps ? ' on' : ''}${k === '⇧' || k === '⌫' ? ' wide' : ''}`}
              onClick={() => tap(k)}
            >
              {k === '⇧' ? '⇧' : k === '⌫' ? '⌫' : caps && !sym ? k.toUpperCase() : k}
            </button>
          ))}
        </div>
      ))}
      <div className="vk-row">
        <button className="vk-key wide" onClick={() => setSym((s) => !s)}>
          {sym ? 'ABC' : '?123'}
        </button>
        <button className="vk-key space" onClick={() => tap(' ')}>
          space
        </button>
        <button className="vk-key" onClick={() => tap('.')}>
          .
        </button>
        <button
          className="vk-key wide done"
          onClick={() => {
            target.current?.blur()
            setVisible(false)
            target.current = null
          }}
        >
          Done
        </button>
      </div>
    </div>
  )
}

const VK_CSS = `
.vk{position:fixed;left:0;right:0;bottom:0;z-index:9999;background:#e8eaed;border-top:1px solid #c4c8cf;
 padding:8px 8px calc(8px + env(safe-area-inset-bottom,0));display:flex;flex-direction:column;gap:7px;
 box-shadow:0 -6px 24px rgba(0,0,0,.18);user-select:none;touch-action:manipulation}
.vk-row{display:flex;gap:6px;justify-content:center}
.vk-key{flex:1 1 0;max-width:96px;height:56px;border:1px solid #c4c8cf;border-radius:9px;background:#fff;
 font-size:20px;color:#1f2430;display:flex;align-items:center;justify-content:center;cursor:pointer;
 -webkit-tap-highlight-color:transparent}
.vk-key:active{background:#cfd4dc;transform:translateY(1px)}
.vk-key.wide{max-width:118px;font-size:16px;font-weight:600}
.vk-key.space{max-width:520px;flex:4}
.vk-key.on{background:#2563eb;color:#fff;border-color:#2563eb}
.vk-key.done{background:#0a296d;color:#fff;font-weight:700}
`

import { useEffect, useId, useState } from 'react'
import { fetchWithTimeout } from '../../practice/lib/practice-cache'

// Przelewy24's own instalment widget (mini badge + calculator modal), rendered
// unaltered from their SDK. We add no copy of our own around it: PayPro S.A. is
// the registered credit intermediary, we are not. The server decides whether
// anything shows at all (p24:installmentWidgetConfig returns null while Raty is
// not offered or the basket is under the floor), and in that case this
// component renders nothing and loads no script.
const SDK_SRC = 'https://apm.przelewy24.pl/installments/installment-calculator-app.umd.sdk.js'
const MODAL_ID = 'calculator-modal'   // the SDK forbids "installment-calculator-modal"
let sdkPromise = null
function loadSdk() {
  if (window.InstallmentCalculatorApp) return Promise.resolve()
  if (!sdkPromise) {
    sdkPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = SDK_SRC; s.async = true
      s.onload = resolve; s.onerror = () => reject(new Error('P24 widget SDK failed to load'))
      document.head.appendChild(s)
    })
  }
  return sdkPromise
}
let modalPromise = null
function ensureModal(app) {
  if (!modalPromise) {
    if (!document.getElementById(MODAL_ID)) {
      const host = document.createElement('div'); host.id = MODAL_ID; document.body.appendChild(host)
    }
    modalPromise = app.create('calculator-modal').then(m => { m.render(MODAL_ID); return m })
  }
  return modalPromise
}

export default function RatyWidget({ amountPLN }) {
  const hostId = useId().replace(/:/g, '') + '-raty'
  const [config, setConfig] = useState(null)
  useEffect(() => {
    let alive = true
    fetchWithTimeout('/api/action', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'p24:installmentWidgetConfig', args: { amount: Math.round(Number(amountPLN) * 100) } }),
    }).then(r => r.json()).then(p => { if (alive && p?.status === 'success' && p.value) setConfig(p.value) })
      .catch(() => { /* no widget is the correct failure mode */ })
    return () => { alive = false }
  }, [amountPLN])
  useEffect(() => {
    if (!config) return
    let cancelled = false
    loadSdk().then(async () => {
      if (cancelled || !window.InstallmentCalculatorApp) return
      const app = new window.InstallmentCalculatorApp(config)
      await ensureModal(app)                       // must exist before the mini widget
      const mini = await app.create('mini-widget')
      if (!cancelled) mini.render(hostId)
    }).catch(() => { /* leave the card as it was */ })
    return () => { cancelled = true }
  }, [config, hostId])
  if (!config) return null
  return <div id={hostId} className="lp-raty-widget" />
}

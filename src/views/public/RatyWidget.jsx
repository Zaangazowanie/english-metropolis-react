import { useEffect, useId, useState } from 'react'
import { fetchWithTimeout } from '../../practice/lib/practice-cache'

// Keep Przelewy24's own badge and offer calculator. Each package links to the
// SDK's calculator URL so its amount cannot be replaced by another card's.
// One shop-level config request serves the page; each card adds its own amount.
const SDK_SRC = 'https://apm.przelewy24.pl/installments/installment-calculator-app.umd.sdk.js'

let shopConfigPromise = null
function shopConfig() {
  if (!shopConfigPromise) {
    shopConfigPromise = fetchWithTimeout('/api/action', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'p24:installmentWidgetConfig', args: {} }),
    }).then(r => r.json()).then(p => (p?.status === 'success' && p.value) ? p.value : null)
      .catch(() => null)
  }
  return shopConfigPromise
}
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

export default function RatyWidget({ amountPLN }) {
  const hostId = useId().replace(/:/g, '') + '-raty'
  const amount = Math.round(Number(amountPLN) * 100)
  const [config, setConfig] = useState(null)
  const [calculator, setCalculator] = useState(null)
  useEffect(() => {
    let alive = true
    shopConfig().then(shop => {
      if (!alive) return
      if (!shop || !(amount >= shop.minAmount)) { setConfig(null); return }
      const { minAmount, ...rest } = shop
      setConfig({ ...rest, amount })
    })
    return () => { alive = false }
  }, [amount])
  useEffect(() => {
    if (!config) return
    let cancelled = false
    let mini = null
    loadSdk().then(async () => {
      if (cancelled || !window.InstallmentCalculatorApp) return
      const app = new window.InstallmentCalculatorApp(config)
      const widget = await app.create('mini-widget')
      if (cancelled) return
      mini = widget
      mini.render(hostId)
      setCalculator({ amount: config.amount, url: app.getCalculatorUrl() })
    }).catch(() => { /* leave the card as it was */ })
    return () => { cancelled = true; mini?.cleanup() }
  }, [config, hostId])
  if (!config || config.amount !== amount) return null
  const ready = calculator?.amount === amount
  return <a
    href={ready ? calculator.url : undefined}
    target="_blank"
    rel="noopener noreferrer"
    className="lp-raty-widget"
    style={{ display: ready ? 'block' : 'none', textDecoration: 'none' }}
    onClick={event => event.stopPropagation()}
  ><span id={hostId} /></a>
}

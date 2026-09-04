import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCart, cart, cartCount, cartTotalPLN, formatPLN } from './cart-store.js'
import { PACKAGE_LESSONS, packageValidity } from './packages.js'
import AnimatedMoney from './AnimatedMoney.jsx'
import './cart-ui.css'

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'

// Floating cart pill + slide-in drawer for the public lessons page.
// The drawer is transition-based (not keyframes) so rapid open/close and
// add-while-open all retarget smoothly.
export default function CartUI({ lang = 'pl' }) {
  const navigate = useNavigate()
  const state = useCart()
  const [open, setOpen] = useState(false)
  const count = cartCount(state)
  const total = cartTotalPLN(state)
  const pillRef = useRef(null)
  const drawerRef = useRef(null)
  const closeRef = useRef(null)
  const isPl = lang === 'pl'
  const t = (en, pl) => (isPl ? pl : en)

  // A dialog owns focus while it is open: focus lands on the close button when
  // it opens, Tab cycles inside it, Escape closes it, and focus returns to the
  // pill that opened it. Before this the pill kept focus behind the backdrop.
  useEffect(() => {
    if (!open) return undefined
    const drawer = drawerRef.current
    const opener = pillRef.current
    const focusTimer = window.setTimeout(() => closeRef.current?.focus({ preventScroll: true }), 60)
    const onKey = (e) => {
      if (e.key === 'Escape') { setOpen(false); return }
      if (e.key !== 'Tab' || !drawer) return
      const nodes = [...drawer.querySelectorAll(FOCUSABLE)].filter((n) => n.offsetParent !== null || n === document.activeElement)
      if (!nodes.length) return
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      else if (!drawer.contains(document.activeElement)) { e.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(focusTimer)
      window.removeEventListener('keydown', onKey)
      opener?.focus({ preventScroll: true })
    }
  }, [open])

  // Tells the stylesheet to stand the Bajla launcher down while the drawer is
  // open. The widget is a separate injected script at z-index 2147483000, so it
  // would otherwise float over the basket and no z-index here could stop it.
  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    document.body.setAttribute('data-emc-cart-open', open ? 'true' : 'false')
    // Cleared on unmount too, or a route change while open would strand the
    // launcher hidden on a page that has no cart at all.
    return () => document.body.removeAttribute('data-emc-cart-open')
  }, [open])

  return (
    <>
      <button
        ref={pillRef}
        type="button"
        className="emc-pill"
        data-visible={count > 0}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t(`Open cart, ${count} ${count === 1 ? 'item' : 'items'}`, `Otwórz koszyk, pozycji: ${count}`)}
      >
        <span className="material-symbols-outlined" aria-hidden>shopping_cart</span>
        <span className="emc-pill-label">{t('Cart', 'Koszyk')}</span>
        <span key={count} className="emc-badge">{count}</span>
      </button>

      <div className="emc-backdrop" data-open={open} onClick={() => setOpen(false)} aria-hidden />

      <aside ref={drawerRef} className="emc-drawer" data-open={open} role="dialog" aria-modal="true" aria-label={t('Shopping cart', 'Koszyk')} aria-hidden={!open}>
        <header className="emc-head">
          <h2>
            <span className="material-symbols-outlined" aria-hidden>shopping_cart</span>
            {t('Your cart', 'Twój koszyk')}
          </h2>
          <button ref={closeRef} type="button" className="emc-close" onClick={() => setOpen(false)} aria-label={t('Close cart', 'Zamknij koszyk')}>
            <span className="material-symbols-outlined" aria-hidden>close</span>
          </button>
        </header>

        {state.items.length === 0 ? (
          <div className="emc-empty">
            <span className="material-symbols-outlined" aria-hidden>remove_shopping_cart</span>
            <p>{t('Your cart is empty. Add a lesson package to begin.', 'Twój koszyk jest pusty. Dodaj pakiet lekcji, aby zacząć.')}</p>
          </div>
        ) : (
          <>
            <ul className="emc-items">
              {state.items.map((item, idx) => (
                <li key={item.id} className="emc-item" style={{ '--emc-i': idx }}>
                  <div className="emc-item-info">
                    <strong>{isPl ? item.namePl || item.name : item.name}</strong>
                    <span>{isPl ? item.pacePl || item.pace : item.pace} · {packageValidity(PACKAGE_LESSONS[item.id])[isPl ? 'pl' : 'en']}</span>
                  </div>
                  <div className="emc-item-controls">
                    <div className="emc-qty" role="group" aria-label={t('Quantity', 'Ilość')}>
                      <button type="button" onClick={() => cart.setQty(item.id, item.qty - 1)} aria-label={t('Decrease', 'Zmniejsz')}>−</button>
                      <span aria-live="polite">{item.qty}</span>
                      <button type="button" onClick={() => cart.setQty(item.id, item.qty + 1)} aria-label={t('Increase', 'Zwiększ')}>+</button>
                    </div>
                    <span className="emc-item-price">{formatPLN(item.pricePLN * item.qty)}</span>
                    <button type="button" className="emc-remove" onClick={() => cart.remove(item.id)} aria-label={t('Remove', 'Usuń')}>
                      <span className="material-symbols-outlined" aria-hidden>delete</span>
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            <footer className="emc-foot">
              <div className="emc-total">
                <span>{t('Total (VAT included)', 'Razem (z VAT)')}</span>
                <strong><AnimatedMoney value={total} /></strong>
              </div>
              <button
                type="button"
                className="emc-checkout"
                onClick={() => { setOpen(false); navigate('/checkout') }}
              >
                <span className="material-symbols-outlined" aria-hidden>lock</span>
                {t('Proceed to checkout', 'Przejdź do kasy')}
              </button>
              <button type="button" className="emc-continue" onClick={() => setOpen(false)}>
                {t('Continue browsing packages', 'Wróć do pakietów')}
              </button>
              <p className="emc-note">
                {t(
                  'Prices in PLN, VAT included. You choose how to pay at checkout, through Przelewy24.',
                  'Ceny w PLN, z VAT. Sposób płatności wybierzesz w kasie, przez Przelewy24.',
                )}
              </p>
            </footer>
          </>
        )}
      </aside>
    </>
  )
}

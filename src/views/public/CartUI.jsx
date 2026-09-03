import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCart, cart, cartCount, cartTotalPLN, formatPLN } from './cart-store.js'
import { PACKAGE_LESSONS, packageValidity } from './packages.js'
import './cart-ui.css'

// Floating cart pill + slide-in drawer for the public lessons page.
// The drawer is transition-based (not keyframes) so rapid open/close and
// add-while-open all retarget smoothly.
export default function CartUI({ lang = 'pl' }) {
  const navigate = useNavigate()
  const state = useCart()
  const [open, setOpen] = useState(false)
  const [bump, setBump] = useState(0)
  const count = cartCount(state)
  const total = cartTotalPLN(state)
  const prevCount = useRef(count)
  const isPl = lang === 'pl'
  const t = (en, pl) => (isPl ? pl : en)

  useEffect(() => {
    if (count > prevCount.current) setBump((b) => b + 1)
    prevCount.current = count
  }, [count])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
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
        type="button"
        className="emc-pill"
        data-visible={count > 0}
        onClick={() => setOpen(true)}
        aria-label={t(`Open cart, ${count} items`, `Otwórz koszyk, pozycji: ${count}`)}
      >
        <span className="material-symbols-outlined" aria-hidden>shopping_cart</span>
        <span className="emc-pill-label">{t('Cart', 'Koszyk')}</span>
        <span key={bump} className="emc-badge">{count}</span>
      </button>

      <div className="emc-backdrop" data-open={open} onClick={() => setOpen(false)} aria-hidden />

      <aside className="emc-drawer" data-open={open} role="dialog" aria-modal="true" aria-label={t('Shopping cart', 'Koszyk')}>
        <header className="emc-head">
          <h2>
            <span className="material-symbols-outlined" aria-hidden>shopping_cart</span>
            {t('Your cart', 'Twój koszyk')}
          </h2>
          <button type="button" className="emc-close" onClick={() => setOpen(false)} aria-label={t('Close cart', 'Zamknij koszyk')}>
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
                    <strong>{item.name}</strong>
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
                <strong>{formatPLN(total)}</strong>
              </div>
              <button
                type="button"
                className="emc-checkout"
                onClick={() => { setOpen(false); navigate('/checkout') }}
              >
                <span className="material-symbols-outlined" aria-hidden>lock</span>
                {t('Proceed to checkout', 'Przejdź do kasy')}
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

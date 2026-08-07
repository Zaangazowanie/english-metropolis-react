// The checkout payment picker. It renders only what Przelewy24 report as
// enabled on this shop, so a method we cannot actually take can never appear
// here. Presentational on purpose: Checkout owns the fetch and the selection.
import { GROUP_COPY } from './payment-method-copy.js'
import PaymentMark from './PaymentMarks.jsx'


export default function PaymentMethods({ lang, groups, loading, failed, value, onChange }) {
  const isPl = lang === 'pl'
  const t = (en, pl) => (isPl ? pl : en)

  if (loading) {
    return (
      <div className="co-methods co-methods-loading" aria-busy="true">
        <p className="sr-only" role="status">{t('Loading payment methods', 'Wczytujemy metody płatności')}</p>
        {[0, 1, 2].map((i) => <div key={i} className="co-method-skeleton" style={{ '--co-i': i }} aria-hidden />)}
      </div>
    )
  }

  // No list means we could not reach P24 just now. Checkout still works: the
  // customer picks on the Przelewy24 page instead, so this is a downgrade of
  // convenience, never a blocked sale. role="status" so a screen reader hears
  // why the radios it was promised are not there.
  if (failed || !groups || groups.length === 0) {
    return (
      <p className="co-methods-fallback" role="status">
        {t(
          'You will choose how to pay on the secure Przelewy24 page.',
          'Sposób płatności wybierzesz na bezpiecznej stronie Przelewy24.',
        )}
      </p>
    )
  }

  // The parent fieldset and its legend already group and label these radios,
  // and the shared name attribute makes them one keyboard group, so no ARIA
  // role is added here: it would only re-announce the options a second time.
  return (
    <div className="co-methods">
      {groups.map((group, idx) => {
        const copy = GROUP_COPY[group.key]
        if (!copy) return null
        const text = isPl ? copy.pl : copy.en
        const selected = value === group.key
        return (
          <label key={group.key} className="co-method" data-selected={selected} style={{ '--co-i': idx }}>
            <input
              type="radio"
              name="co-payment-method"
              value={group.key}
              checked={selected}
              onChange={() => onChange(group.key)}
            />
            <span className="co-method-icon" aria-hidden><PaymentMark kind={copy.mark} /></span>
            <span className="co-method-text">
              <strong>{text.title}</strong>
              <small>{text.sub(group.count)}</small>
            </span>
            <svg className="co-method-check" viewBox="0 0 24 24" aria-hidden focusable="false">
              <circle cx="12" cy="12" r="11" />
              <path d="M7 12.4l3.3 3.3L17 9" />
            </svg>
          </label>
        )
      })}
    </div>
  )
}

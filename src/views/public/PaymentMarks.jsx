// Payment marks drawn inline. Przelewy24 host official method logos, but the
// site CSP allows img-src 'self' only, and a payment page is the last place to
// add a third-party request that can fail silently or leak a page view. These
// are generic method glyphs, not any scheme's trademark.
const MARKS = {
  blik: (
    <>
      <rect x="3" y="2.5" width="12" height="19" rx="3" />
      <path d="M9 18.4h.01" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M17.2 7.6l3.4 3.4-3.4 3.4" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  card: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="3" />
      <path d="M2 10h20" strokeWidth="2.4" />
      <circle cx="15.4" cy="15" r="2.4" />
      <circle cx="18.6" cy="15" r="2.4" />
    </>
  ),
  bank: (
    <>
      <path d="M12 3l9 4.6H3L12 3z" strokeLinejoin="round" />
      <path d="M5.6 10.4v6.4M10 10.4v6.4M14 10.4v6.4M18.4 10.4v6.4" strokeLinecap="round" />
      <path d="M3.4 20.4h17.2" strokeLinecap="round" />
    </>
  ),
}

export default function PaymentMark({ kind }) {
  return (
    <svg className="co-mark" viewBox="0 0 24 24" aria-hidden focusable="false"
      fill="none" stroke="currentColor" strokeWidth="1.6">
      {MARKS[kind] || MARKS.card}
    </svg>
  )
}

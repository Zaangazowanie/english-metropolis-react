// Copy and grouping for the checkout payment picker. Split from the component
// so Checkout can import the known keys without breaking fast refresh.
// Polish counts three ways. 21 banków, 22 banki, 1 bank — hard-coding one form
// reads as broken grammar on the page where people hand over money.
function banksPl(n) {
  const last = n % 10
  const teen = n % 100 >= 12 && n % 100 <= 14
  if (n === 1) return '1 bank'
  if (!teen && last >= 2 && last <= 4) return `${n} banki`
  return `${n} banków`
}

export const GROUP_COPY = {
  blik: {
    mark: 'blik',
    en: { title: 'BLIK', sub: () => 'Six-digit code from your banking app' },
    pl: { title: 'BLIK', sub: () => 'Sześciocyfrowy kod z aplikacji banku' },
  },
  card: {
    mark: 'card',
    en: { title: 'Card', sub: () => 'Visa and Mastercard' },
    pl: { title: 'Karta', sub: () => 'Visa i Mastercard' },
  },
  paypo: {
    mark: 'deferred',
    en: { title: 'PayPo', sub: () => 'Pay in 30 days; instalments for eligible customers' },
    pl: { title: 'PayPo', sub: () => 'Zapłać za 30 dni; raty dla uprawnionych klientów' },
  },
  // Przelewy24 Raty (method 303). Deliberately neutral copy: the lender shows
  // the plans, tenors and the representative example on its own page. We must
  // not print our own instalment pricing here (pośrednik kredytowy exposure).
  installments: {
    mark: 'deferred',
    en: { title: 'Instalments', sub: () => 'Przelewy24 Raty; plans and terms are shown by the lender on the next screen' },
    pl: { title: 'Raty', sub: () => 'Raty Przelewy24; plany i warunki pokaże kredytodawca na następnym ekranie' },
  },
  transfer: {
    mark: 'bank',
    en: { title: 'Online transfer', sub: (n) => (n === 1 ? 'Choose your bank' : `Choose from ${n} banks`) },
    pl: { title: 'Przelew online', sub: (n) => (n === 1 ? 'Wybierz swój bank' : `Do wyboru ${banksPl(n)}`) },
  },
}

export const KNOWN_METHOD_KEYS = Object.keys(GROUP_COPY)

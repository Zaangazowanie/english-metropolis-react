// Public lesson-package cart — Przelewy24 requires a real shopping cart where
// customers add packages before proceeding to payment (Regulamin § 3(3)).
// Module-level store consumed via useSyncExternalStore so the lessons page,
// the cart drawer and /checkout share state without provider wiring.
import { useSyncExternalStore } from 'react'

const STORAGE_KEY = 'em.cart.v1'

function load() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { items: [] }
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed.items)) return { items: [] }
    return { items: parsed.items.filter((i) => i && i.id && i.qty > 0) }
  } catch {
    return { items: [] }
  }
}

let state = load()
const listeners = new Set()

function persist() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Cart still works in-memory when storage is unavailable.
  }
}

function emit(next) {
  state = next
  persist()
  listeners.forEach((fn) => fn())
}

export function parsePricePLN(label) {
  const m = String(label).replace(/[,\s]/g, '').match(/(\d+)/)
  return m ? parseInt(m[1], 10) : 0
}

export const cart = {
  subscribe(fn) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
  get() {
    return state
  },
  add(item) {
    const items = [...state.items]
    const found = items.find((i) => i.id === item.id)
    if (found) {
      found.qty = Math.min(found.qty + 1, 20)
    } else {
      items.push({ ...item, qty: 1 })
    }
    emit({ items })
  },
  setQty(id, qty) {
    if (qty <= 0) return cart.remove(id)
    emit({ items: state.items.map((i) => (i.id === id ? { ...i, qty: Math.min(qty, 20) } : i)) })
  },
  remove(id) {
    emit({ items: state.items.filter((i) => i.id !== id) })
  },
  clear() {
    emit({ items: [] })
  },
}

export function useCart() {
  return useSyncExternalStore(cart.subscribe, cart.get, () => ({ items: [] }))
}

export function cartCount(s) {
  return s.items.reduce((n, i) => n + i.qty, 0)
}

export function cartTotalPLN(s) {
  return s.items.reduce((n, i) => n + i.pricePLN * i.qty, 0)
}

export function formatPLN(n) {
  return `${n.toLocaleString('pl-PL')} PLN`
}

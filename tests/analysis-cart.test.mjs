import { build } from 'esbuild'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const bundled = await build({
  entryPoints: ['src/views/public/cart-store.js'], bundle: true, write: false, format: 'esm', platform: 'node',
  plugins: [{ name: 'react-store-hook', setup(b) {
    b.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'stub' }))
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const useSyncExternalStore = (_, get) => get()' }))
  } }],
})

test('AI choice survives quantity edits, reload and removal; completed checkout clears it', async () => {
  const memory = new Map()
  const previous = globalThis.window
  globalThis.window = { localStorage: { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) } }
  try {
    const load = suffix => import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text + '\n//' + suffix).toString('base64')}`)
    const { cart, cartAnalysisPrice, cartTotalPLN } = await load('first')
    assert.equal(!!cart.get().analysisAddon, false)
    cart.setAnalysisAddon(true)
    cart.add({ id: 'private-core', pricePLN: 480 })
    assert.equal(cartAnalysisPrice(cart.get()).totalPLN, 60)
    assert.equal(cartTotalPLN(cart.get()), 480, 'base lesson price excludes optional analysis')
    cart.setQty('private-core', 2)
    assert.equal(cart.get().analysisAddon, true)
    assert.equal(cartAnalysisPrice(cart.get()).totalPLN, 120)
    cart.add({ id: 'single', pricePLN: 135 })
    assert.deepEqual(cartAnalysisPrice(cart.get()), { lessons: 9, totalPLN: 140, listTotalPLN: 180, savingPLN: 40 })
    const reloaded = (await load('reload')).cart
    assert.equal(reloaded.get().analysisAddon, true)
    assert.equal(reloaded.get().items.length, 2)
    reloaded.remove('single')
    assert.equal(reloaded.get().analysisAddon, true)
    reloaded.setAnalysisAddon(false)
    assert.equal((await load('opt-out')).cart.get().analysisAddon, false)
    reloaded.clear()
    assert.deepEqual((await load('cleared')).cart.get().items, [])
    assert.equal(!!(await load('cleared')).cart.get().analysisAddon, false)
  } finally {
    if (previous === undefined) delete globalThis.window
    else globalThis.window = previous
  }
})

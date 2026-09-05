import assert from 'node:assert/strict';
import test from 'node:test';
import { acceptsWordShortcut, hasNativeActivation } from '../src/practice/lib/word-keyboard.ts';

const event = (extra = {}) => ({ defaultPrevented: false, altKey: false, ctrlKey: false, metaKey: false, target: null, ...extra });
test('word shortcuts preserve browser commands, IME input and already-handled grid events', () => {
  assert.equal(acceptsWordShortcut(event()), true);
  for (const flag of ['defaultPrevented', 'altKey', 'ctrlKey', 'metaKey', 'isComposing']) {
    assert.equal(acceptsWordShortcut(event({ [flag]: true })), false, flag);
  }
  assert.equal(acceptsWordShortcut(event({ target: { closest: selector => selector.includes('contenteditable') ? {} : null } })), false);
  assert.equal(acceptsWordShortcut(event({ nativeEvent: { isComposing: true } })), false);
});
test('focused tiles, levers and disclosures keep Enter while a bare game surface can submit', () => {
  for (const tag of ['button', 'a[href]', 'summary', '[role="button"]', '[role="gridcell"]']) {
    const target = { closest: selector => selector.split(', ').includes(tag) ? {} : null };
    assert.equal(hasNativeActivation(target), true, tag);
    assert.equal(acceptsWordShortcut(event({ target })), true, 'typing a letter still works on a tile');
  }
  assert.equal(hasNativeActivation(null), false);
  assert.equal(hasNativeActivation({ closest: () => null }), false);
});

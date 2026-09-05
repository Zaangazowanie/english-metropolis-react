import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ts from 'typescript';

function load(relative, dependencies = {}) {
  const filename = fileURLToPath(new URL(relative, import.meta.url));
  const require = createRequire(filename);
  const module = { exports: {} };
  const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
    fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  });
  new Function('require', 'module', 'exports', outputText)(name => name in dependencies ? dependencies[name] : require(name), module, module.exports);
  return module.exports;
}
const noop = () => {};
const Piece = () => null;
const Grid = () => null;
const sceneDependencies = {
  './word-kit/Stage': { Stage: () => null, Piece, Grid, Rail: () => null },
  './word-kit/Machines': new Proxy({}, { get: () => () => null }),
  './word-kit/useMachineCommit': load('../src/practice/shells3d/word-kit/useMachineCommit.ts'),
  './word-kit/mechanics': load('../src/practice/shells3d/word-kit/mechanics.ts'),
};
const scene = name => load(`../src/practice/shells3d/Word${name}3D.tsx`, sceneDependencies).default;
function elements(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(elements);
  return [tree, ...elements(tree.props?.children)];
}
async function mount(t, Component, initialProps) {
  const timers = new Map(); let timerId = 0;
  t.mock.method(globalThis, 'setTimeout', callback => { timers.set(++timerId, callback); return timerId; });
  t.mock.method(globalThis, 'clearTimeout', id => timers.delete(id));
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const previousElement = Object.getOwnPropertyDescriptor(globalThis, 'Element');
  const previousAct = Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  const listeners = new Map();
  const window = {
    HTMLIFrameElement: class {}, dispatchEvent: noop, setTimeout, clearTimeout,
    addEventListener: (type, callback) => { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(callback); },
    removeEventListener: (type, callback) => listeners.get(type)?.delete(callback),
  };
  const document = { nodeType: 9, activeElement: null, defaultView: window, addEventListener: noop, removeEventListener: noop };
  const container = { nodeType: 1, tagName: 'DIV', nodeName: 'DIV', namespaceURI: 'http://www.w3.org/1999/xhtml', ownerDocument: document, textContent: '', addEventListener: noop, removeEventListener: noop };
  globalThis.window = window; globalThis.document = document; globalThis.Element = class {}; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(container); let props = initialProps, tree;
  function Probe() { tree = Component(props); return null; }
  const render = async next => { props = { ...props, ...next }; await act(async () => root.render(React.createElement(Probe))); };
  t.after(async () => {
    await act(async () => root.unmount());
    for (const [name, previous] of [['window', previousWindow], ['document', previousDocument], ['Element', previousElement], ['IS_REACT_ACT_ENVIRONMENT', previousAct]]) {
      if (previous) Object.defineProperty(globalThis, name, previous); else delete globalThis[name];
    }
  });
  await render({});
  return {
    render, get tree() { return tree; },
    nodes: predicate => elements(tree).filter(predicate),
    piece: label => elements(tree).find(node => node.type === Piece && node.props.label === label),
    fire: async callback => { await act(async () => callback()); },
    event: async (type, event = {}) => { await act(async () => [...(listeners.get(type) ?? [])].forEach(callback => callback(event))); },
    finish: async () => { const pending = [...timers.values()]; timers.clear(); await act(async () => pending.forEach(callback => callback())); },
  };
}

test('Anagram keeps native Enter for focused controls, while typing and a surface Enter complete one word', async t => {
  const decisions = [], completed = [];
  const arcade = { answer: right => decisions.push(right), restart: noop, complete: noop };
  const Shell = load('../src/practice/shells/Anagram.tsx', {
    '../lib/word-keyboard': load('../src/practice/lib/word-keyboard.ts'),
    './word-arcade-mechanics': load('../src/practice/shells/word-arcade-mechanics.ts'),
    './word-arcade': { WordMission: noop, useWordArcade: () => arcade },
    '../lib/convex-stubs': { useShellProgress: () => ({ save: noop, reset: noop }) },
    '../components/primitives': { Bajla: noop, HintButton: noop, Nameplate: noop, Progress: noop, SkipButton: noop },
    '../components/AmbientAudioPlayer': { AmbientAudioPlayer: noop },
  }).AnagramShell;
  const game = await mount(t, Shell, { puzzle: { word: 'BRIDGE', clue: 'Cross a river.', clue_pl: 'Przeprawa.' }, onSessionComplete: value => completed.push(value) });
  const key = async (value, target = null, extra = {}) => {
    const event = { key: value, target, defaultPrevented: false, altKey: false, ctrlKey: false, metaKey: false, preventDefault() { this.defaultPrevented = true; }, ...extra };
    await game.fire(() => game.tree.props.onKeyDown(event)); return event;
  };
  const tile = { closest: selector => selector.includes('button,') ? {} : null };
  assert.equal((await key('Enter', tile)).defaultPrevented, false);
  await key('b', null, { ctrlKey: true });
  assert.equal(game.nodes(n => n.props?.className === 'wa-letter is-tile' && n.props.disabled).length, 0);
  for (const letter of 'BRIDGE') await key(letter);
  assert.deepEqual(decisions, []);
  assert.equal((await key('Enter', tile)).defaultPrevented, false);
  assert.deepEqual(decisions, []);
  await key('Enter');
  assert.deepEqual(decisions, [true]);
  assert.equal(completed.length, 1);
  assert.equal(completed[0].correctCount, 1);
});

test('GroupSort Express scene exposes only the next parcel and enables chutes only with a selection', async t => {
  const deliveries = [];
  const game = await mount(t, scene('GroupSort'), {
    groups: [{ id: 'fruit', name: 'Fruit', color: '#f90' }], items: [{ word: 'apple', group: 'fruit' }, { word: 'pear', group: 'fruit' }],
    placed: {}, active: null, express: true, onSelect: noop, onRoute: (...args) => deliveries.push(args),
  });
  assert.equal(game.piece('1 · Fruit').props.disabled, true);
  assert.equal(game.piece('apple').props.disabled, false);
  assert.equal(game.piece('pear').props.disabled, true);
  await game.render({ active: 'apple' });
  await game.fire(() => game.piece('1 · Fruit').props.onPick());
  assert.deepEqual(deliveries, []);
  assert.equal(game.piece('apple').props.disabled, true);
  await game.finish();
  assert.deepEqual(deliveries, [['fruit', 'apple']]);
  await game.render({ placed: { apple: 'fruit' }, active: 'pear' });
  assert.equal(game.piece('apple'), undefined);
  assert.equal(game.piece('pear').props.disabled, false);
});

test('WordFormation ignores edits while the press runs and locks all building pieces after completion', async t => {
  const built = [], submitted = [];
  const game = await mount(t, scene('WordFormation'), { base: 'BRAVE', draft: 'bravery', done: false, onBuild: word => built.push(word), onSubmit: () => submitted.push(true) });
  await game.fire(() => game.piece('Press form').props.onPick());
  assert.equal(game.piece('un-').props.disabled, true);
  await game.fire(() => game.piece('un-').props.onPick());
  assert.deepEqual(built, []);
  await game.finish();
  assert.deepEqual(submitted, [true]);
  await game.render({ done: true });
  assert.ok(game.nodes(n => n.type === Piece && n.props.onPick).every(n => n.props.disabled));
});

test('OpenCloze seal remains unavailable for blank, skipped and already solved spans', async t => {
  const game = await mount(t, scene('OpenCloze'), { gaps: [{ id: 1, value: '', done: false, wrong: false, skipped: false }], active: 1, onSelect: noop, onSeal: noop });
  assert.equal(game.piece('Seal selected span').props.disabled, true);
  for (const update of [{ value: 'in', done: false, skipped: false, disabled: false }, { value: 'in', done: true, skipped: false, disabled: true }, { value: 'in', done: false, skipped: true, disabled: true }]) {
    await game.render({ gaps: [{ id: 1, wrong: false, ...update }] });
    assert.equal(game.piece('Seal selected span').props.disabled, update.disabled);
  }
});

test('OpenCloze Enter grades the live text even before a pending input update renders, exactly once per gap', async t => {
  const decisions = [], completed = [];
  const arcade = { answer: right => decisions.push(right), restart: noop, complete: noop };
  const Shell = load('../src/practice/shells/OpenCloze.tsx', {
    './word-arcade-mechanics': load('../src/practice/shells/word-arcade-mechanics.ts'),
    './word-arcade': { WordMission: noop, useWordArcade: () => arcade },
    '../lib/convex-stubs': { useShellProgress: () => ({ save: noop, reset: noop }) },
    '../components/primitives': {
      Bajla: noop, HintCard: noop, Progress: noop, Nameplate: noop, SkipButton: noop, HintButton: noop, Confetti: noop,
      useEndOfShellTip: () => ({ recordWrong: noop, reset: noop }),
      normalise: load('../src/practice/lib/text.ts').normalise,
    },
    '../components/AmbientAudioPlayer': { AmbientAudioPlayer: noop },
  }).OpenClozeShell;
  const game = await mount(t, Shell, { onSessionComplete: value => completed.push(value) });
  const input = id => game.nodes(node => node.type === 'input' && node.props['aria-label']?.startsWith(`Blank ${id},`))[0];
  const answers = ['in', 'of', 'every', 'on', 'He', 'of'];
  for (const [index, value] of answers.entries()) {
    const id = index + 1;
    const field = input(id);
    await game.fire(() => {
      field.props.onChange({ target: { value } });
      const enter = { key: 'Enter', currentTarget: { value }, preventDefault: noop };
      field.props.onKeyDown(enter);
      field.props.onKeyDown(enter);
    });
    assert.equal(input(id).props.disabled, true, `gap ${id} is solved`);
    assert.equal(input(id).props.value, value);
    assert.equal(decisions.length, id, 'two Enter events award only once');
  }
  assert.deepEqual(decisions, [true, true, true, true, true, true]);
  assert.equal(completed.length, 1);
  assert.equal(completed[0].correctCount, 6);
  assert.deepEqual(Object.values(completed[0].studentInputs), answers);
});

async function mountWordsearch(t) {
  const requests = [];
  const grid = ['NEON', 'RAIL', 'XXXX', 'XXXX'].map(row => row.split(''));
  const game = await mount(t, scene('Wordsearch'), {
    grid, routes: [], onTrail: (start, end, commit) => {
      requests.push({ start, end, commit });
      return start[1] === 0 && end[1] === 3 && start[0] === end[0] && start[0] < 2;
    },
  });
  // Only browser hit-testing is doubled; captures, gesture refs, keyboard picks,
  // window release listeners and React state all run in the actual component.
  const targets = grid.map((row, r) => row.map((_, c) => Object.assign(new Element(), {
    dataset: { gridRow: String(r), gridCol: String(c) }, closest() { return this; }, hasPointerCapture: () => false,
  })));
  game.tree.props.ref.current = { contains: target => targets.flat().includes(target) };
  document.elementFromPoint = (x, y) => targets[y]?.[x] ?? null;
  const board = () => game.nodes(node => node.type === Grid)[0];
  return {
    game, requests, board,
    pick: async (r, c, source = 'keyboard') => game.fire(() => board().props.onPick(r, c, source)),
    down: async (r, c) => game.fire(() => game.tree.props.onPointerDownCapture({ button: 0, target: targets[r][c], pointerId: 7 })),
    move: async (r, c) => game.fire(() => game.tree.props.onPointerMoveCapture({ clientX: c, clientY: r, pointerId: 7 })),
  };
}

test('Wordsearch accepts each letter without committing partial guesses and clears a complete match', async t => {
  const { game, requests, board, pick } = await mountWordsearch(t);
  await pick(0, 0);
  assert.deepEqual(requests, []);
  await pick(0, 1);
  await pick(0, 2);
  assert.deepEqual(requests, [
    { start: [0, 0], end: [0, 1], commit: false },
    { start: [0, 0], end: [0, 2], commit: false },
  ]);
  assert.equal(board().props.cells.filter(cell => cell.active).length, 3);
  await pick(0, 3);
  assert.deepEqual(requests.at(-1), { start: [0, 0], end: [0, 3], commit: false });
  assert.equal(board().props.cells.filter(cell => cell.active).length, 0);
  assert.equal(game.nodes(node => node.props?.role === 'status')[0].props.children, 'Word found. Choose your next word.');
});

test('Wordsearch Escape cancellation ends an active drag before any later move or release can grade it', async t => {
  const { game, requests, board, down, move } = await mountWordsearch(t);
  await down(0, 0); await move(0, 2);
  assert.equal(board().props.cells.filter(cell => cell.active).length, 3);
  await game.fire(() => board().props.onCancel());
  await move(0, 3); await game.event('pointerup');
  assert.deepEqual(requests, []);
  assert.equal(board().props.cells.filter(cell => cell.active).length, 0);
});

test('Wordsearch keyboard starts the next trail after a drag releases outside without a synthetic cell click', async t => {
  const { game, requests, board, pick, down, move } = await mountWordsearch(t);
  await down(0, 0); await move(0, 3);
  await game.event('pointerup', { target: null });
  assert.deepEqual(requests, [{ start: [0, 0], end: [0, 3], commit: true }]);
  await pick(1, 0);
  assert.equal(board().props.cells.find(cell => cell.r === 1 && cell.c === 0).active, true);
  await pick(1, 3);
  assert.deepEqual(requests.at(-1), { start: [1, 0], end: [1, 3], commit: false });
});

test('Wordsearch pointer cancellation grades nothing and leaves keyboard activation available', async t => {
  const { game, requests, board, pick, down, move } = await mountWordsearch(t);
  await down(0, 0); await move(0, 3);
  await game.event('pointercancel'); await game.event('pointerup');
  assert.deepEqual(requests, []);
  await pick(1, 0);
  assert.equal(board().props.cells.find(cell => cell.r === 1 && cell.c === 0).active, true);
});

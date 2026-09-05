import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ts from 'typescript';

// Compile the actual TS/TSX sources with the already-installed compiler. React
// hooks run through React DOM; only the browser host and network are test doubles.
function loadSource(relativePath, dependencies = {}) {
  const filename = fileURLToPath(new URL(relativePath, import.meta.url));
  const require = createRequire(filename);
  const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  });
  const module = { exports: {} };
  const requireDependency = name => Object.hasOwn(dependencies, name) ? dependencies[name] : require(name);
  new Function('require', 'module', 'exports', outputText)(requireDependency, module, module.exports);
  return module.exports;
}

const feedback = loadSource('../src/practice/lib/arcade-feedback.ts');
const persistence = loadSource('../src/practice/lib/convex-stubs.ts', {
  './arcade-feedback': feedback,
  './practice-cache': loadSource('../src/practice/lib/practice-cache.ts'),
});
const { ShellProgressPersistenceContext, useShellProgress } = persistence;
const defaults = { progress: 0, completed: false, hintsUsed: 0 };
const stateOf = ({ save, reset, ...state }) => state;
const successfulResponse = value => ({ ok: true, status: 200, json: async () => ({ status: 'success', value }) });

async function mountProgress(t, { persist, slug = 'logged-in-learner', legacy = false, reply = () => null } = {}) {
  const reads = [];
  const requests = [];
  const reports = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const request = { url, ...JSON.parse(init.body) };
    requests.push(request);
    return successfulResponse(await reply(request));
  });

  // The probe renders no host elements. This small container gives React DOM
  // its event/owner-document surface without replacing React's hook lifecycle.
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousAct = Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  const window = {
    HTMLIFrameElement: class {},
    localStorage: {
      getItem(key) {
        reads.push(key);
        return key === 'em-student-session' && !legacy ? JSON.stringify({ slug }) : key === 'studentSlug' ? slug : null;
      },
    },
  };
  globalThis.window = window;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const document = { nodeType: 9, activeElement: null, defaultView: window, addEventListener() {}, removeEventListener() {} };
  const container = {
    nodeType: 1, tagName: 'DIV', nodeName: 'DIV', namespaceURI: 'http://www.w3.org/1999/xhtml',
    ownerDocument: document, textContent: '', addEventListener() {}, removeEventListener() {},
  };
  const root = createRoot(container);
  let latest;
  let props = { persist, shellId: 'matching', exerciseId: 'lesson-42' };
  const report = (shellId, state) => reports.push({ shellId, ...state });
  function Probe({ shellId, exerciseId }) {
    latest = useShellProgress(shellId, exerciseId);
    return null;
  }
  async function render(next = {}) {
    props = { ...props, ...next };
    let element = React.createElement(feedback.ArcadeFeedbackContext.Provider, { value: report }, React.createElement(Probe, props));
    if (props.persist !== undefined) element = React.createElement(ShellProgressPersistenceContext.Provider, { value: props.persist }, element);
    await act(async () => { root.render(element); });
  }
  t.after(async () => {
    await act(async () => { root.unmount(); });
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else delete globalThis.window;
    if (previousAct) Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', previousAct);
    else delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  });
  await render();
  return { reads, requests, reports, render, get current() { return latest; } };
}

test('city demo mount, saves, reset, and puzzle changes never read a learner slug or contact Convex', async t => {
  const demo = await mountProgress(t, { persist: false, reply: () => ({ progress: 0.9, completed: true, hintsUsed: 5 }) });
  assert.deepEqual(stateOf(demo.current), defaults);
  assert.deepEqual(demo.reads, []);
  assert.deepEqual(demo.requests, []);

  await act(async () => { demo.current.save({ progress: 0.5, hintsUsed: 1, lastState: 'correct', meta: { correct: 2 }, exerciseId: 'demo-only' }); });
  const halfway = { progress: 0.5, completed: false, hintsUsed: 1, lastState: 'correct', meta: { correct: 2 } };
  assert.deepEqual(stateOf(demo.current), halfway);
  assert.deepEqual(demo.reports.at(-1), { shellId: 'matching', ...halfway });

  await act(async () => { demo.current.save({ progress: 1, completed: true }); });
  assert.deepEqual(stateOf(demo.current), { ...halfway, progress: 1, completed: true });
  assert.deepEqual(demo.reports.at(-1), { shellId: 'matching', ...halfway, progress: 1, completed: true });
  await act(async () => { demo.current.reset(); });
  assert.deepEqual(stateOf(demo.current), defaults);
  assert.deepEqual(demo.reports.at(-1), { shellId: 'matching', ...defaults });
  assert.equal(demo.reports.length, 3);

  await act(async () => { demo.current.save({ progress: 0.25 }); });
  await demo.render({ exerciseId: 'another-demo' });
  assert.deepEqual(stateOf(demo.current), defaults);
  await act(async () => { demo.current.save({ progress: 0.75 }); });
  await demo.render({ shellId: 'wordsearch' });
  assert.deepEqual(stateOf(demo.current), defaults);
  assert.deepEqual(demo.reads, []);
  assert.deepEqual(demo.requests, []);
});

test('ordinary practice still hydrates by default and persists save deltas and resets for the logged-in learner', async t => {
  const row = { progress: 0.4, completed: false, hintsUsed: 2, lastState: 'active', meta: { correct: 2 } };
  const practice = await mountProgress(t, { reply: request => request.path === 'practice:getProgress' ? row : null });
  assert.deepEqual(stateOf(practice.current), row);
  assert.ok(practice.reads.includes('em-student-session'));
  assert.deepEqual(practice.requests, [{ url: '/api/query', path: 'practice:getProgress', args: { studentSlug: 'logged-in-learner', shellId: 'matching', exerciseId: 'lesson-42' } }]);
  await act(async () => { practice.current.save({ progress: 0.6, exerciseId: 'lesson-43' }); });
  assert.deepEqual(stateOf(practice.current), { ...row, progress: 0.6 });
  assert.deepEqual(practice.requests.at(-1), { url: '/api/mutation', path: 'practice:saveProgress', args: { studentSlug: 'logged-in-learner', shellId: 'matching', exerciseId: 'lesson-43', progress: 0.6 } });
  await act(async () => { practice.current.reset(); });
  assert.deepEqual(stateOf(practice.current), defaults);
  assert.deepEqual(practice.requests.at(-1), { url: '/api/mutation', path: 'practice:reset', args: { studentSlug: 'logged-in-learner', shellId: 'matching', exerciseId: 'lesson-42' } });
  assert.equal(practice.requests.length, 3);
  assert.deepEqual(practice.reports.at(-1), { shellId: 'matching', ...defaults });
});

test('ordinary practice retains the legacy studentSlug fallback', async t => {
  const practice = await mountProgress(t, { legacy: true });
  assert.deepEqual(practice.reads, ['em-student-session', 'studentSlug']);
  assert.equal(practice.requests[0].args.studentSlug, 'logged-in-learner');
});

test('switching to demo scope discards an in-flight learner hydration and stops further persistence', async t => {
  let resolveQuery;
  const pending = new Promise(resolve => { resolveQuery = resolve; });
  const demo = await mountProgress(t, { persist: true, reply: () => pending });
  assert.equal(demo.requests.length, 1);
  const readsBeforeDemo = demo.reads.length;
  await demo.render({ persist: false });
  await act(async () => { demo.current.save({ progress: 0.5 }); });
  await act(async () => { resolveQuery({ progress: 1, completed: true, hintsUsed: 9 }); });
  assert.deepEqual(stateOf(demo.current), { ...defaults, progress: 0.5 });
  await act(async () => { demo.current.reset(); });
  assert.deepEqual(stateOf(demo.current), defaults);
  assert.equal(demo.reads.length, readsBeforeDemo);
  assert.equal(demo.requests.length, 1);
});

test('the city entry opts its game out of persistence and forwards completion scores to the city callback', async () => {
  // Cabinet presentation is outside this test; the entry provider, game props,
  // and result adapter are the actual modules used by the World loaders.
  const Cabinet = () => null;
  const { loadArcadeEntry } = loadSource('../src/practice/shells3d/kit/arcade-entry.tsx', {
    '../../components/ArcadeCabinet': { ArcadeCabinet: Cabinet },
    '../../lib/convex-stubs': persistence,
    './arcade-entry-result': loadSource('../src/practice/shells3d/kit/arcade-entry-result.ts'),
    '../../styles/system.css': {}, '../../styles/global.css': {}, '../../styles/arcade.css': {},
  });
  const Game = () => null;
  const { default: Entry } = await loadArcadeEntry('opencloze', 'Open Cloze', 7, async () => ({ default: Game }));
  const sessions = [];
  const tree = Entry({ onSessionComplete: result => sessions.push(result) });
  assert.equal(tree.type, ShellProgressPersistenceContext.Provider);
  assert.equal(tree.props.value, false);
  const cabinet = tree.props.children.props.children;
  assert.equal(cabinet.type, Cabinet);
  assert.equal(cabinet.props.shellId, 'opencloze');
  const game = cabinet.props.children.props.children;
  assert.equal(game.type, Game);
  game.props.onSessionComplete({ correctCount: 5, totalGaps: 6 });
  assert.deepEqual(sessions, [{ shellKey: 'opencloze', correctCount: 5, totalGaps: 6, totalQuestions: 6 }]);
  const noCallbackGame = Entry({}).props.children.props.children.props.children.props.children;
  assert.doesNotThrow(() => noCallbackGame.props.onSessionComplete({ correctCount: 1, totalQuestions: 2 }));
});

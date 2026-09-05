import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ts from 'typescript';

function loadSource(relativePath, dependencies = {}) {
  const filename = fileURLToPath(new URL(relativePath, import.meta.url));
  const require = createRequire(filename);
  const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', outputText)(
    name => Object.hasOwn(dependencies, name) ? dependencies[name] : require(name), module, module.exports,
  );
  return module.exports;
}

const dependencies = {
  './practice-cache': loadSource('../src/practice/lib/practice-cache.ts'),
  './arcade-feedback': loadSource('../src/practice/lib/arcade-feedback.ts'),
  './scheduler': loadSource('../src/practice/lib/scheduler.ts'),
};
const { useShellProgress } = loadSource('../src/practice/lib/convex-stubs.ts', dependencies);
const { useStudentExposure, useSessionShellHistory } = loadSource('../src/practice/lib/exposure.ts', dependencies);
const { useSessionState } = loadSource('../src/practice/lib/useSessionState.ts', dependencies);

async function mount(t, { preview = true, corruptedSession = false } = {}) {
  const requests = [];
  const writes = [];
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const oldAct = Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  const window = {
    HTMLIFrameElement: class {},
    location: { pathname: preview ? '/admin/student-view/ines/lessons' : '/app/operator/lessons' },
    localStorage: {
      getItem: key => key === 'em-student-session' ? JSON.stringify({ slug: 'operator', sessionToken: 'ordinary' }) : null,
      setItem: (...args) => writes.push(['set', ...args]),
      removeItem: (...args) => writes.push(['remove', ...args]),
    },
    sessionStorage: {
      getItem: key => key === 'em-student-view' ? JSON.stringify({
        student: { slug: 'ines' }, sessionToken: 'preview', expiresAt: Date.now() + 60_000,
      }) : null,
    },
  };
  globalThis.window = window;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const request = { url, ...JSON.parse(init.body) };
    requests.push(request);
    let value = null;
    if (request.path === 'practice:getProgress') value = { progress: 0.4, completed: false };
    if (request.path === 'exposure:recentExposures') value = [];
    if (request.path === 'practice:getActiveSession') value = {
      state: corruptedSession ? 'invalid JSON' : JSON.stringify({ progress: 0.4 }),
      questionIds: ['q1'], updatedAt: Date.now() - 20 * 60_000, startedAt: Date.now() - 30 * 60_000,
    };
    return { ok: true, status: 200, json: async () => ({ status: 'success', value }) };
  });
  const document = { nodeType: 9, activeElement: null, defaultView: window, addEventListener() {}, removeEventListener() {} };
  const container = {
    nodeType: 1, tagName: 'DIV', nodeName: 'DIV', namespaceURI: 'http://www.w3.org/1999/xhtml',
    ownerDocument: document, textContent: '', addEventListener() {}, removeEventListener() {},
  };
  const root = createRoot(container);
  let current;
  let unmounted = false;
  function Probe() {
    current = {
      progress: useShellProgress('matching', 'lesson-42'),
      exposure: useStudentExposure(),
      history: useSessionShellHistory(),
      session: useSessionState('matching'),
    };
    return null;
  }
  async function unmount() {
    if (unmounted) return;
    unmounted = true;
    await act(async () => { root.unmount(); });
  }
  t.after(async () => {
    await unmount();
    if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow); else delete globalThis.window;
    if (oldAct) Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', oldAct); else delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  });
  await act(async () => { root.render(React.createElement(Probe)); });
  return { requests, writes, window, unmount, get current() { return current; } };
}

test('student view reads the selected learner while practice activity never persists, including after exit', async t => {
  const view = await mount(t);
  assert.equal(view.current.progress.progress, 0.4);
  assert.ok(view.current.session.pendingSession);
  assert.ok(view.requests.length >= 3);
  assert.ok(view.requests.every(request => request.args.studentSlug === 'ines'));
  await act(async () => {
    view.current.progress.save({ progress: 1, completed: true });
    view.current.progress.reset();
    view.current.exposure.recordExposure({ itemId: 'q1', itemKind: 'exercise' }, 'matching');
    view.current.exposure.recordExposureBatch([{ itemId: 'q2', itemKind: 'exercise' }], 'matching');
    view.current.history.pushShell('matching', ['q1']);
    view.current.history.clearSession();
    view.current.session.snapshot({ progress: 1 }, ['q1']);
    await view.current.session.startFresh({ newQuestions: true });
    await view.current.session.discardSession();
    await view.current.session.markComplete();
  });
  const previousCallbacks = view.current;
  view.window.location.pathname = '/admin/superadmin';
  await act(async () => { previousCallbacks.session.snapshot({ progress: 1 }, ['q1']); });
  await view.unmount();
  assert.equal(view.requests.filter(request => request.url === '/api/mutation').length, 0);
  assert.deepEqual(view.writes, []);
});

test('inspecting a corrupted practice snapshot does not discard the learner record', async t => {
  const view = await mount(t, { corruptedSession: true });
  assert.equal(view.current.session.pendingSession, null);
  assert.equal(view.requests.filter(request => request.url === '/api/mutation').length, 0);
});

test('ordinary student practice still saves progress, exposures and session snapshots', async t => {
  const view = await mount(t, { preview: false });
  await act(async () => {
    view.current.progress.save({ progress: 0.5 });
    view.current.exposure.recordExposure({ itemId: 'q1', itemKind: 'exercise' }, 'matching');
    view.current.session.snapshot({ progress: 0.5 }, ['q1']);
  });
  await view.unmount();
  const mutations = view.requests.filter(request => request.url === '/api/mutation');
  assert.deepEqual(mutations.map(request => request.path).sort(), [
    'exposure:recordExposure', 'practice:saveProgress', 'practice:saveSessionSnapshot',
  ]);
  assert.ok(mutations.every(request => request.args.studentSlug === 'operator'));
});

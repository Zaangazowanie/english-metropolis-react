import test from 'node:test';
import assert from 'node:assert/strict';
import { createStreetAdvance } from './word-arcade-crossword.ts';

function fixture() {
  const callbacks = new Map(), cleared = [];
  let id = 0;
  const moves = [];
  const advance = createStreetAdvance(cursor => moves.push(cursor), {
    set: callback => { callbacks.set(++id, callback); return id; },
    clear: handle => cleared.push(handle),
  });
  return { advance, callbacks, cleared, moves };
}
const gate = {r:8,c:4,dir:'across'}, tower = {r:1,c:3,dir:'down'};

test('manual clue selection or typing cancels an older auto-advance, even if its callback is already queued', () => {
  const f = fixture();
  f.advance.schedule(gate);
  f.advance.cancel(); // learner selects TOWER and begins typing
  f.callbacks.get(1)();
  assert.deepEqual(f.moves, []);
  assert.deepEqual(f.cleared, [1]);
});

test('rapid successive solves cannot allow the older street timer to redirect the next word', () => {
  const f = fixture();
  f.advance.schedule(gate);
  f.advance.schedule(tower);
  f.callbacks.get(1)();
  assert.deepEqual(f.moves, []);
  f.callbacks.get(2)();
  assert.deepEqual(f.moves, [tower]);
  f.callbacks.get(2)();
  assert.deepEqual(f.moves, [tower]);
});

test('an untouched completed street advances after its animation, while unmount cancellation stays inert', () => {
  const f = fixture();
  f.advance.schedule(gate); f.callbacks.get(1)();
  assert.deepEqual(f.moves, [gate]);
  f.advance.schedule(tower); f.advance.cancel(); f.callbacks.get(2)();
  assert.deepEqual(f.moves, [gate]);
});

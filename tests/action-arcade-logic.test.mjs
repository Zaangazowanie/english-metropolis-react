import test from 'node:test';
import assert from 'node:assert/strict';
import { nextMazeStep, snakeStep, sonarCount, selectedWheelRotation, advanceCompletionLatch, currentMoleSlots } from '../src/practice/shells/action-arcade-logic.mjs';

test('shadow follows open corridors, not a Manhattan shortcut through walls', () => {
  const maze = [[1,1,1,1,1],[1,0,1,0,1],[1,0,1,0,1],[1,0,0,0,1],[1,1,1,1,1]];
  assert.deepEqual(nextMazeStep(maze, {r:1,c:1}, {r:1,c:3}), {r:2,c:1});
  assert.deepEqual(nextMazeStep(maze, {r:1,c:1}, {r:0,c:0}), {r:1,c:1});
});
test('snake wraps safely and may enter the vacated tail cell', () => {
  const wrapped = snakeStep([{r:0,c:0},{r:0,c:1}], 'up', 12, 16);
  assert.deepEqual(wrapped.head, {r:11,c:0});
  const loop = [{r:1,c:1},{r:1,c:2},{r:2,c:2},{r:2,c:1}];
  assert.equal(snakeStep(loop,'down',12,16).collided,false);
  assert.equal(snakeStep(loop,'right',12,16).collided,true);
  assert.equal(snakeStep(loop,'down',12,16,true).collided,true);
});
test('sonar counts diagonal living hulls and excludes sunk hulls and queried square', () => {
  const ships=[{r:2,c:2,isHit:false},{r:1,c:1,isHit:false},{r:1,c:2,isHit:false},{r:3,c:3,isHit:true},{r:5,c:5,isHit:false}];
  assert.equal(sonarCount(ships,2,2),2);
  assert.equal(sonarCount(ships,0,0),1);
});
test('wheel lands on the learner-selected wedge for every answer count and previous rotation', () => {
  for (const count of [2,3,4,6,8]) for(let choice=0;choice<count;choice++) for(const previous of [0,100,1756,11222]) {
    const rotation=selectedWheelRotation(previous,choice,count);
    assert.ok(rotation-previous >=1440);
    const selectedCenter=(choice+.5)*360/count;
    const distance=((rotation+selectedCenter)%360+360)%360;
    assert.ok(distance < 1e-8 || Math.abs(distance-360)<1e-8);
  }
});


test('full-session completion signals once and unfinished reset rearms it', () => {
  let latch = advanceCompletionLatch(false, false);
  assert.equal(latch.emit, false);
  latch = advanceCompletionLatch(latch.announced, true);
  assert.equal(latch.emit, true);
  latch = advanceCompletionLatch(latch.announced, true);
  assert.equal(latch.emit, false);
  latch = advanceCompletionLatch(latch.announced, false);
  assert.equal(latch.emit, false);
  assert.equal(advanceCompletionLatch(latch.announced, true).emit, true);
});
test('forced previews never claim completion, including repeated effect runs', () => {
  const forced = advanceCompletionLatch(false, true, true);
  assert.equal(forced.emit, false);
  assert.equal(advanceCompletionLatch(forced.announced, true, false).emit, false);
  const reset = advanceCompletionLatch(forced.announced, false, false);
  assert.equal(advanceCompletionLatch(reset.announced, true, false).emit, true);
});

test('recycled mole holes show the current visible slot, never an old hidden word', () => {
  const moles = [
    { holeIdx: 2, word: 'subway', state: 'down', spawnedAt: 10 },
    { holeIdx: 2, word: 'bus', state: 'up', spawnedAt: 20 },
    { holeIdx: 4, word: 'train', state: 'falling', spawnedAt: 15 },
    { holeIdx: 0, word: 'platform', state: 'down', spawnedAt: 30 },
  ];
  assert.deepEqual(currentMoleSlots(moles), [-1, -1, 1, -1, 2, -1]);
  moles[1].holeIdx = 0;
  moles[2].state = 'down';
  assert.deepEqual(currentMoleSlots(moles), [1, -1, -1, -1, -1, -1]);
});

test('mole controls stay at six holes across collisions and a fresh round', () => {
  const previousRound = [
    { holeIdx: 2, word: 'subway', state: 'up', spawnedAt: 10 },
    { holeIdx: 2, word: 'bus', state: 'rising', spawnedAt: 20 },
  ];
  assert.deepEqual(currentMoleSlots(previousRound), [-1, -1, 1, -1, -1, -1]);
  const nextRound = [{ holeIdx: 2, word: 'kiosk', state: 'up', spawnedAt: 30 }];
  const slots = currentMoleSlots(nextRound);
  assert.equal(slots.length, 6);
  assert.deepEqual(slots.filter(index => index >= 0).map(index => nextRound[index].word), ['kiosk']);
});

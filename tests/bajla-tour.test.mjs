import test from 'node:test'
import assert from 'node:assert/strict'
import { walkthroughDelay, nextExample, cursorTarget, playbackDuration } from '../src/views/v3/bajla-tour.mjs'

test('all seven walkthroughs run at 1.5x the previous pace, including the last screen', () => {
  for (const id of ['memory','voice','grammar','booking','notes','practice','word']) {
    const old = [1400,1200,4200,id === 'practice' ? 1200 : 3200,3600,3600,3600]
    old.forEach((duration, step) => assert.equal(walkthroughDelay(id, step), (duration + 2000) / 1.5))
  }
})

test('typing and cursor choreography use the same 1.5x playback clock', () => {
  assert.equal(playbackDuration(24),16)
  assert.equal(playbackDuration(900),600)
  assert.equal(playbackDuration(1800),1200)
})
test('tour crosses from Web to WhatsApp and wraps back to Web', () => {
  assert.equal(nextExample(2,7),3)
  assert.equal(nextExample(6,7),0)
  assert.equal(nextExample(0,7,-1),6)
  let index=0
  const sequence=[]
  for(let i=0;i<15;i++){sequence.push(index);index=nextExample(index,7)}
  assert.deepEqual(sequence,[0,1,2,3,4,5,6,0,1,2,3,4,5,6,0])
})
test('guide selects the demonstrated answer and never auto-plays a final external video', () => {
  assert.deepEqual(cursorTarget('grammar',4,'quiz'),['.bj-demo-answers button',1])
  assert.deepEqual(cursorTarget('booking',2,'quiz'),['.bj-walk-slots button',1])
  assert.equal(cursorTarget('word',6,'hear'),null)
  assert.deepEqual(cursorTarget('practice',4,'gap'),['.bj-walk-options button',1])
  assert.deepEqual(cursorTarget('memory',5,'quiz',{habit:1}),['.bj-demo-answers button',0])
  assert.deepEqual(cursorTarget('booking',2,'quiz',{booking:'cancel'}),['.bj-walk-action',0])
  assert.deepEqual(cursorTarget('practice',2,'hear'),['.bj-demo-choice-list button',4])
})

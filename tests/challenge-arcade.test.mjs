import test from 'node:test';
import assert from 'node:assert/strict';
import { sentenceIsCorrect, rankAssessment, challengeReward, consumeChallengeBoost } from '../src/practice/shells/challenge-arcade-logic.ts';

test('sentence launch accepts interchangeable duplicate words without accepting reused tiles', () => {
  const words = ['the', 'cat', 'the', 'window', 'passed'];
  const expected = [0,1,4,2,3];
  assert.equal(sentenceIsCorrect(words, expected, [2,1,4,0,3]), true);
  assert.equal(sentenceIsCorrect(words, expected, [0,1,4,0,3]), false);
  assert.equal(sentenceIsCorrect(words, expected, [0,4,1,2,3]), false);
  assert.equal(sentenceIsCorrect(words, expected, [null,1,4,2,3]), false);
  assert.equal(sentenceIsCorrect(words, expected, [0,1,4,2]), false);
});

test('rank submit distinguishes correct, wrong, empty and duplicated ballots', () => {
  const items = [{id:'a',correctRank:1},{id:'b',correctRank:2},{id:'c',correctRank:3}];
  assert.deepEqual(rankAssessment(items,['a','b','c']),[true,true,true]);
  assert.deepEqual(rankAssessment(items,['c','b','a']),[false,true,false]);
  assert.deepEqual(rankAssessment(items,[null,'b','b']),[false,true,false]);
});

test('boosts double real successful decisions, never award for misses or repeated solves', () => {
  assert.equal(challengeReward(true,false,true,150),300);
  assert.equal(challengeReward(true,false,false,100),100);
  assert.equal(challengeReward(false,false,true,100),0);
  assert.equal(challengeReward(true,true,true,100),null);
});

test('one armed boost is consumed once across a synchronous multi-slot dispatch', () => {
  const boost = { armed:true, remaining:2 };
  const points = [true,true,true,true,true].map(right => challengeReward(right,false,consumeChallengeBoost(boost),100));
  assert.deepEqual(points,[200,100,100,100,100]);
  assert.deepEqual(boost,{armed:false,remaining:1});
  boost.armed = true;
  assert.equal(challengeReward(false,false,consumeChallengeBoost(boost),100),0);
  assert.deepEqual(boost,{armed:false,remaining:0});
  boost.armed = true;
  assert.equal(consumeChallengeBoost(boost),false);
  assert.equal(boost.remaining,0);
});

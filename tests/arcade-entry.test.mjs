import test from 'node:test';
import assert from 'node:assert/strict';
import { citySessionResult } from '../src/practice/shells3d/kit/arcade-entry-result.ts';

test('city errands preserve canonical scores and attach their district', () => {
  assert.deepEqual(citySessionResult('matching', { correctCount: 7, totalQuestions: 8 }), {
    shellKey: 'matching', correctCount: 7, totalQuestions: 8,
  });
});
test('open cloze totalGaps becomes the city session question total', () => {
  const result = citySessionResult('opencloze', { correctCount: 5, totalGaps: 6 });
  assert.equal(result.totalQuestions, 6);
  assert.equal(result.correctCount, 5);
  assert.equal(result.shellKey, 'opencloze');
});

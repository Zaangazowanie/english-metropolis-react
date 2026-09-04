import test from 'node:test';
import assert from 'node:assert/strict';
import { clozeResolved, anagramCleanCount, shuffledTranslations, typingDispatchStats, expandErrorSelection, insertionPointMatches } from './word-arcade-mechanics.ts';

test('a wrong cloze guess stays playable until corrected or explicitly skipped',()=>{
  const gaps=[{id:1},{id:7}];
  assert.equal(clozeResolved(gaps,{1:'right',7:'wrong'},new Set()),false);
  assert.equal(clozeResolved(gaps,{1:'right',7:'right'},new Set()),true);
  assert.equal(clozeResolved(gaps,{1:'right',7:'wrong'},new Set([7])),true);
  assert.equal(clozeResolved(gaps,{1:'wrong',7:'wrong'},new Set([7])),false);
});
test('skipping an anagram never earns a correct grade and repeated attempts deduct once',()=>{
  assert.equal(anagramCleanCount(['METRO','TRAM','BRIDGE'],['TRAM','TRAM'],{METRO:'METRO',TRAM:'TRAM'}),1);
  assert.equal(anagramCleanCount(['METRO'],[],{}),0);
  assert.equal(anagramCleanCount(['METRO'],[],{METRO:'METRO'}),1);
});
test('each matching stage shuffles its own translated words without losing duplicates',()=>{
  const first=[{en:'bridge',pl:'most',line:'violet'},{en:'tower',pl:'wieża',line:'violet'}];
  const second=[{en:'gate',pl:'brama',line:'amber'},{en:'square',pl:'plac',line:'amber'}];
  assert.deepEqual(new Set(shuffledTranslations(first).violet),new Set(['most','wieża']));
  assert.deepEqual(new Set(shuffledTranslations(second).amber),new Set(['brama','plac']));
  assert.equal(shuffledTranslations(second).violet,undefined);
  assert.notDeepEqual(shuffledTranslations(first).violet,first.map(p=>p.pl));
});
test('dispatch stats include final keystroke and handle short runs without infinity',()=>{
  assert.deepEqual(typingDispatchStats('metro','metro',6000),{correct:5,accuracy:100,wpm:10});
  assert.deepEqual(typingDispatchStats('metxo','metro',6000),{correct:4,accuracy:80,wpm:8});
  assert.equal(typingDispatchStats('metro','metro',0).wpm,60);
});
test('error detective can select a phrase in either direction and return to one word',()=>{
  assert.deepEqual(expandErrorSelection([8,12],[3,7],true),[3,12]);
  assert.deepEqual(expandErrorSelection([3,7],[8,12],true),[3,12]);
  assert.deepEqual(expandErrorSelection([3,12],[8,12],false),[8,12]);
});

test('missing-word insertions accept the same gap on either side of its whitespace, not another word',()=>{
  assert.equal(insertionPointMatches('She is teacher.',6,7),true);
  assert.equal(insertionPointMatches('She is teacher.',6,0),false);
  assert.equal(insertionPointMatches('She is teacher.',6,14),false);
});

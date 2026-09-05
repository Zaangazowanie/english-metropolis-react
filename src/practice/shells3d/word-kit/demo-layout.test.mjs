import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source = name => readFileSync(new URL(`../../shells/${name}.tsx`, import.meta.url),'utf8');
function crosswordFixture() {
 const block=source('Crossword').split('const CW_PUZZLE: CWPuzzle = {')[1].split('\n};')[0];
 return {size:Number(block.match(/size: (\d+)/)[1]),words:[...block.matchAll(/id: (\d+), dir: '(across|down)', row: (\d+), col: (\d+), answer: '([^']+)'/g)].map(m=>({id:+m[1],dir:m[2],row:+m[3],col:+m[4],answer:m[5]}))};
}
test('built-in crossword streets have compatible crossings and form one connected district',()=>{
 const {size,words}=crosswordFixture(), board=new Map(), links=new Map(words.map(w=>[w.id,new Set()]));
 assert.equal(words.length,9);
 for(const w of words) for(let i=0;i<w.answer.length;i++){
  const r=w.row+(w.dir==='down'?i:0),c=w.col+(w.dir==='across'?i:0),key=`${r},${c}`;
  assert.ok(r>=0&&r<size&&c>=0&&c<size,`${w.answer} fits board`);
  if(board.has(key)) {const existing=board.get(key); assert.equal(w.answer[i],existing.letter,`${w.answer} agrees at ${key}`);links.get(w.id).add(existing.id);links.get(existing.id).add(w.id);}
  board.set(key,{letter:w.answer[i],id:w.id});
 }
 const visited=new Set(),pending=[words[0].id];while(pending.length){const id=pending.pop();if(visited.has(id))continue;visited.add(id);pending.push(...links.get(id));}
 assert.equal(visited.size,words.length,'every street connects to METRO');
});
test('built-in wordsearch does not overwrite any target with another target letter',()=>{
 const block=source('Wordsearch').split('const WS_PUZZLE: WSPuzzle = {')[1].split('\n};')[0];
 const size=Number(block.match(/size: (\d+)/)[1]);
 const words=[...block.matchAll(/word: '([^']+)'[^\n]+start: \[(\d+), (\d+)\], end: \[(\d+), (\d+)\]/g)],board=new Map();
 assert.equal(words.length,8);
 for(const [,word,rs,cs,re,ce] of words){const dr=(+re-+rs)/(word.length-1),dc=(+ce-+cs)/(word.length-1);assert.ok([-1,0,1].includes(dr)&&[-1,0,1].includes(dc));
  for(let i=0;i<word.length;i++){const r=+rs+dr*i,c=+cs+dc*i,key=`${r},${c}`;assert.ok(r>=0&&r<size&&c>=0&&c<size);if(board.has(key))assert.equal(word[i],board.get(key),`${word} agrees at ${key}`);board.set(key,word[i]);}
 }
});

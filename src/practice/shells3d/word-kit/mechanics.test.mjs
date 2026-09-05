import test from 'node:test';
import assert from 'node:assert/strict';
import {gridTrail,pointOnTrail,turnSpellingDial,motionFraction} from './mechanics.ts';

test('roof routes include every cell in all eight straight directions and reject a crooked path',()=>{
 for(const [dr,dc] of [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]]){
  const start=[5,5],end=[5+dr*3,5+dc*3];const trail=gridTrail(start,end);
  assert.equal(trail.length,4);assert.deepEqual(trail[0],start);assert.deepEqual(trail[3],end);
  assert.equal(pointOnTrail([5+dr,5+dc],start,end),true);
 }
 assert.deepEqual(gridTrail([0,0],[2,3]),[]);
 assert.equal(pointOnTrail([3,2],[1,1],[4,4]),false);
});
test('spelling tumblers wrap alphabetically and do not overwrite another chosen socket',()=>{
 assert.equal(turnSpellingDial('',0,1,5),'a');
 assert.equal(turnSpellingDial('',0,-1,5),'z');
 assert.equal(turnSpellingDial('zebra',0,1,5),'aebra');
 assert.equal(turnSpellingDial('apple',0,-1,5),'zpple');
 assert.equal(turnSpellingDial('',3,1,5),'   a');
 assert.equal(turnSpellingDial('abc',8,1,3),'abc');
});
test('physical deliveries approach their destination without overshooting and reduced motion settles immediately',()=>{
 const amount=motionFraction(1/60);assert.ok(amount>0&&amount<1);
 let position=-4;for(let i=0;i<60;i++)position+=(4-position)*amount;
 assert.ok(position>3.99&&position<=4);
 assert.equal(motionFraction(-1),0);assert.equal(motionFraction(1/60,true),1);
 assert.ok(motionFraction(10)<=1);
});

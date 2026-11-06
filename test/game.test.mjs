import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame,nextCell,act,advance,normalizeTelemetry} from '../game.mjs';
const idle={available:true,status:'IDLE',rpm:100},active={available:true,status:'ACTIVE',rpm:120};
test('同一种子生成相同关卡',()=>assert.deepEqual(createGame(7,0).board,createGame(7,0).board));
test('障碍随种子变化，并始终保留入口到出口的通路',()=>{
 const layouts=new Set();
 for(let seed=1;seed<=200;seed++){
  const g=createGame(seed,0);assert.equal(g.walls.length,3);layouts.add(g.walls.join(','));
  const seen=new Set([14]),queue=[14];
  for(const cell of queue)for(let dir=0;dir<4;dir++){const next=nextCell(cell,dir);if(next>=0&&!g.walls.includes(next)&&!seen.has(next)){seen.add(next);queue.push(next);}}
  assert.ok(seen.has(20));
 }
 assert.ok(layouts.size>100);
});
test('棋盘左右边界不能穿越',()=>{assert.equal(nextCell(6,1),-1);assert.equal(nextCell(7,3),-1);});
test('休息时即使上次RPM非零也不自动发电',()=>{const g=createGame();advance(g,1000,idle);assert.equal(g.energy,24);});
test('真实跑动供电，断流不伪造发电',()=>{const g=createGame();advance(g,1000,active);assert.equal(g.energy,28);advance(g,2000,{available:false,status:'UNKNOWN',rpm:120});assert.equal(g.energy,28);assert.equal(g.practiceSeconds,1);});
test('客户端不能提交分数或非法动作',()=>assert.throws(()=>act(createGame(),{type:'score',score:9999},100,idle),/Unsupported/));
test('手摇有热量与冷却，不能无限瞬间加电',()=>{const g=createGame();act(g,{type:'pump'},100,idle);assert.equal(g.energy,30);assert.throws(()=>act(g,{type:'pump'},300,idle),/resetting/);});
test('随机地图实际连通后能救援并计分',()=>{
 const g=createGame(),seen=new Set([14]),queue=[14],parents=new Map();g.energy=60;
 for(const cell of queue)for(let dir=0;dir<4;dir++){const next=nextCell(cell,dir);if(next>=0&&!g.walls.includes(next)&&!seen.has(next)){seen.add(next);parents.set(next,[cell,dir]);queue.push(next);}}
 let steps=0;for(let cell=20;cell!==14;steps++){const [previous,dir]=parents.get(cell);g.board[previous]=dir;cell=previous;}
 act(g,{type:'launch'},100,idle);advance(g,100+steps*700,idle);assert.equal(g.rescued,1);assert.equal(g.runners.length,0);assert.ok(g.score>=100);
});
test('结束后不能继续加分或行动',()=>{const g=createGame();advance(g,120001,idle);assert.equal(g.finished,true);assert.throws(()=>act(g,{type:'launch'},120100,idle),/ended/);});
test('官方遥测明确区分真实IDLE和未知',()=>{const now=Date.now(),raw={schemaVersion:1,measurement:{freshness:'online',receivedAt:new Date(now).toISOString(),coreStatus:'IDLE',rpmMilli:60000,provenance:'hardware'},builder:{anchor:{blockHeight:'100'}}};assert.equal(normalizeTelemetry(raw,now).status,'IDLE');assert.equal(normalizeTelemetry(raw,now+121000).status,'UNKNOWN');assert.throws(()=>normalizeTelemetry({status:'unavailable'}),/schema/);});

export const COLS=7, ROWS=5, DURATION=120000, START=14, EXIT=20;
export const WALLS=[9,23,18];
const MOVES=[-COLS,1,COLS,-1];
/** 创建可复现的传送带关卡；中央障碍上方和下方都有可达路线。 */
export function createGame(seed=1,now=0){
 let value=seed>>>0;
 const board=Array.from({length:COLS*ROWS},()=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return value>>>16&3;});
 return {seed,board,startedAt:now,lastAt:now,nextMove:0,energy:24,heat:0,lastPump:now-2000,rescued:0,lost:0,rotations:0,launched:0,runners:[],score:0,remaining:DURATION,finished:false,liveSeconds:0,practiceSeconds:0,lastActionAt:now-100,notice:'Turn the belts and guide your pals from the entrance to the safe house.'};
}
/** 归一化官方传感器数据，过期或不可用不冒充仓鼠停跑。 */
export function normalizeTelemetry(raw,now=Date.now()){
 const m=raw?.measurement;
 if(raw?.schemaVersion!==1||!m||!['IDLE','ACTIVE','COUNTER_FAULT'].includes(m.coreStatus)||!Number.isFinite(m.rpmMilli))throw Error('Invalid official telemetry schema');
 const received=Date.parse(m.receivedAt),fresh=Number.isFinite(received)&&now-received<=Math.min(Number(m.staleAfterSeconds??120),120)*1000&&m.freshness==='online'&&m.coreStatus!=='COUNTER_FAULT';
 return {available:fresh,status:fresh?m.coreStatus:'UNKNOWN',rpm:m.rpmMilli/1000,receivedAt:m.receivedAt,generatedAt:raw.generatedAt,settledRound:raw.builder?.anchor?.settledThroughRound??null,settledHeight:raw.builder?.anchor?.blockHeight??null,projectedHeight:raw.builder?.projected?.blockHeight??null,provenance:m.provenance??'unknown',installationId:raw.installationId};
}
/** 计算方向的相邻格，禁止左右穿越棋盘边界。 */
export function nextCell(cell,direction){
 if(direction===1&&cell%COLS===COLS-1||direction===3&&cell%COLS===0)return -1;
 const next=cell+MOVES[direction];return next<0||next>=COLS*ROWS?-1:next;
}
/** 由服务端推进救援；真实转速决定发电量，官方数据中断时仅靠玩家手动发电。 */
export function advance(game,now,telemetry){
 if(game.finished)return game;
 const dt=Math.max(0,Math.min(now-game.lastAt,game.remaining));game.lastAt=now;
 game.remaining-=dt;game.heat=Math.max(0,game.heat-dt*0.012);
 const powered=telemetry.available&&telemetry.status==='ACTIVE';
 const generation=powered?Math.min(6,telemetry.rpm/30):0;
 game.energy=Math.min(60,game.energy+generation*dt/1000);
 if(telemetry.available)game.liveSeconds+=dt/1000;else game.practiceSeconds+=dt/1000;
 game.nextMove+=dt;
 while(game.nextMove>=700){
  game.nextMove-=700;
  for(const runner of game.runners){
   if(runner.done||game.energy<1)continue;
   const next=nextCell(runner.cell,game.board[runner.cell]);
   if(next<0||WALLS.includes(next)){runner.jam++;continue;}
   game.energy-=1;runner.cell=next;runner.steps++;
   if(next===EXIT){runner.done=true;game.rescued++;game.score+=100+Math.max(0,30-runner.steps);game.notice=`${game.rescued} ${game.rescued===1?'pal is':'pals are'} home safe!`;}
   else if(runner.steps>=65){runner.done=true;game.lost++;game.notice='A pal got lost. Check the arrows along your route.';}
  }
  game.runners=game.runners.filter(r=>!r.done);
 }
 if(game.remaining<=0){game.finished=true;game.notice=`Shift complete: ${game.rescued} rescued, ${game.score} points.`;}
 return game;
}
/** 只接受旋转、放行和手摇三种操作，分数与资源均由服务端计算。 */
export function act(game,input,now,telemetry){
 advance(game,now,telemetry);
 if(game.finished)throw Error('This shift has ended. Start another rescue.');
 if(now-game.lastActionAt<80)throw Error('One action at a time.');
 if(input.type==='rotate'){
  if(!Number.isInteger(input.cell)||input.cell<0||input.cell>=COLS*ROWS||WALLS.includes(input.cell)||input.cell===EXIT)throw Error('This tile cannot be rotated.');
  game.board[input.cell]=(game.board[input.cell]+1)%4;game.rotations++;
 }else if(input.type==='launch'){
  if(game.runners.length>=4)throw Error('Guide up to four pals at once.');
  if(game.energy<2)throw Error('Battery low. Use the hand crank.');
  game.energy-=2;game.launched++;game.runners.push({id:game.launched,cell:START,steps:0,jam:0,done:false});
 }else if(input.type==='pump'){
  if(now-game.lastPump<1000)throw Error('The crank is resetting.');
  if(game.heat>75)throw Error('The crank is too hot. Let it cool.');
  game.lastPump=now;game.heat+=22;game.energy=Math.min(60,game.energy+6);
 }else throw Error('Unsupported action.');
 game.lastActionAt=now;return game;
}

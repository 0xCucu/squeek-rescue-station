import {COLS,ROWS,START,EXIT,WALLS,createGame,advance,act,normalizeTelemetry} from './game.mjs';

const $=id=>document.getElementById(id),arrows=['↑','→','↓','←'];
const GAME_KEY='squeek-rescue-local-game',SCORES_KEY='squeek-rescue-local-scores';
let current=null,live={available:false,status:'UNKNOWN',rpm:0},scores=[],lastRaw=null,etag='',telemetryBusy=false,nextTelemetryAt=0,wheelAngle=0,lastFrame=performance.now(),lastTick=0,lastSaved=0;

/** 浏览器存储不可用时仍可继续玩，只明确告知本机记录不能持久化。 */
function writeLocal(key,value){
 try{localStorage.setItem(key,JSON.stringify(value));}
 catch{$('notice').textContent='Browser storage is unavailable. This shift will not be saved.';}
}

/** 只恢复当前浏览器自己的数据，旧服务器对局编号不作为本地游戏读取。 */
function restoreLocal(){
 try{
  const saved=JSON.parse(localStorage.getItem(GAME_KEY)||'null');
  if(saved&&Array.isArray(saved.board)&&saved.board.length===COLS*ROWS&&Array.isArray(saved.runners)&&Number.isFinite(saved.lastAt)&&Number.isFinite(saved.remaining))current=saved;
  const records=JSON.parse(localStorage.getItem(SCORES_KEY)||'[]');
  if(Array.isArray(records))scores=records.filter(row=>typeof row.name==='string'&&Number.isFinite(row.score)&&Number.isFinite(row.rescued)).slice(0,10);
  $('name').value=JSON.parse(localStorage.getItem('squeek-rescue-local-name')||'""');
 }catch{$('notice').textContent='Could not restore this browser’s saved shift. Start a new game.';}
}

/** 显示官方遥测，断流与休息分开表达，不把旧转速冒充实时供电。 */
function renderTelemetry(t){
 live=t;$('state').className='status '+(!t.available?'unknown':t.status==='ACTIVE'?'active':'idle');$('state').textContent=!t.available?'Feed unavailable':t.status==='ACTIVE'?'On the wheel':'Resting';
 $('rpm').replaceChildren(document.createTextNode(t.available?t.rpm.toFixed(1):'—'));const unit=document.createElement('em');unit.textContent='RPM';$('rpm').append(unit);
 $('height').textContent=t.settledHeight??'—';$('source').textContent=t.available?(t.provenance==='hardware'?'Real hardware':'Non-hardware'):'Unknown';
 $('feed-note').textContent=t.available?`Sepolia · Observed ${new Date(t.receivedAt).toLocaleTimeString('en-GB',{hour12:false})} · Settled round ${t.settledRound??'—'}`:'Official feed unavailable. The hand crank still works.';
}

/** 浏览器直接读取公开官方接口，只有GET，没有本站API或成绩上传。 */
async function pollTelemetry(){
 if(telemetryBusy||Date.now()<nextTelemetryAt)return;telemetryBusy=true;
 try{
  const response=await fetch('https://api.squeekchain.com/v1/status',{headers:etag?{'if-none-match':etag}:{},signal:AbortSignal.timeout(8000)});
  if(response.status===429||response.status===503){const retry=Number(response.headers.get('retry-after'));if(Number.isFinite(retry)&&retry>0)nextTelemetryAt=Date.now()+retry*1000;throw Error('Official feed temporarily unavailable');}
  if(response.status!==304){if(!response.ok)throw Error('Official feed HTTP '+response.status);lastRaw=await response.json();etag=response.headers.get('etag')??'';}
  renderTelemetry(normalizeTelemetry(lastRaw));
 }catch{renderTelemetry({available:false,status:'UNKNOWN',rpm:0});}
 finally{telemetryBusy=false;}
}

/** 渲染本机排行榜，不伪装成服务器审核或全站玩家排名。 */
function renderScores(){
 $('ranking').replaceChildren();
 if(!scores.length){const empty=document.createElement('p');empty.className='empty';empty.textContent='No local scores yet. Your first shift starts here.';$('ranking').append(empty);}
 for(let i=0;i<scores.length;i++){
  const entry=scores[i],row=document.createElement('div'),name=document.createElement('span'),rank=document.createElement('span'),value=document.createElement('strong');
  row.className='rank-row';rank.className='rank';rank.textContent=String(i+1).padStart(2,'0');name.append(rank,document.createTextNode(entry.name==='救援站验收'?'Station QA':entry.name));
  if(entry.mode==='practice'){const tag=document.createElement('em');tag.textContent='practice';name.append(tag);}
  value.textContent=`${entry.rescued} saved / ${entry.score}`;row.append(name,value);$('ranking').append(row);
 }
}

/** 结束成绩只记录一次，原始成绩只留在当前浏览器。 */
function finishShift(){
 if(!current.finished||current.recorded)return;
 scores.push({id:current.id,name:current.name,score:current.score,rescued:current.rescued,mode:current.practiceSeconds>3?'practice':'live',at:new Date().toISOString()});
 scores.sort((a,b)=>b.score-a.score);scores=scores.slice(0,10);current.recorded=true;
 writeLocal(SCORES_KEY,scores);writeLocal(GAME_KEY,current);renderScores();
}

/** 根据本地引擎渲染棋盘，玩家昵称始终使用安全DOM文本写入。 */
function render(){
 if(!current)return;
 const game=current,seconds=Math.ceil(game.remaining/1000);$('timer').textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
 $('rescued').textContent=game.rescued;$('score').textContent=game.score;$('energy').textContent=`${Math.floor(game.energy)} / 60`;$('heat').textContent=`${Math.round(game.heat)}%`;
 $('energy-bar').style.width=`${game.energy/60*100}%`;$('heat-bar').style.width=`${Math.min(100,game.heat)}%`;
 $('mode').textContent=game.finished?'Shift complete':live.available?'Live wheel linked':'Hand-crank practice';$('notice').textContent=game.notice;
 $('launch').disabled=game.finished||game.energy<2||game.runners.length>=4;$('pump').disabled=game.finished||game.heat>75;$('restart').hidden=!game.finished;$('start').disabled=!game.finished;$('name').disabled=!game.finished;
 for(let i=0;i<COLS*ROWS;i++){
  const tile=$('cell-'+i);tile.replaceChildren(document.createTextNode(WALLS.includes(i)?'':i===EXIT?'⌂':arrows[game.board[i]]));tile.disabled=game.finished||WALLS.includes(i)||i===EXIT;tile.setAttribute('aria-label',`Row ${Math.floor(i/COLS)+1}, column ${i%COLS+1}, direction ${arrows[game.board[i]]}`);
  if(i===START||i===EXIT){const label=document.createElement('em');label.textContent=i===START?'IN':'HOME';tile.append(label);}
  const runners=game.runners.filter(r=>r.cell===i);
  if(runners.length){const hamster=document.createElement('span');hamster.className='runner';hamster.setAttribute('role','img');hamster.setAttribute('aria-label','Hamster');tile.append(hamster);if(runners.length>1){const count=document.createElement('span');count.className='occupancy';count.textContent=runners.length;tile.append(count);}}
 }
}

/** 创建真实可操作的棋盘，不需要服务器生成对局。 */
function buildBoard(){
 for(let i=0;i<COLS*ROWS;i++){const tile=document.createElement('button');tile.id='cell-'+i;tile.className='tile'+(WALLS.includes(i)?' wall':'')+(i===EXIT?' exit':'')+(i===START?' entry':'');tile.textContent=WALLS.includes(i)?'':i===EXIT?'⌂':'→';tile.disabled=true;tile.addEventListener('click',rotateTile);$('board').append(tile);}
}

/** 点击棋盘时只将对应位置交给本地引擎旋转。 */
function rotateTile(event){action({type:'rotate',cell:Number(event.currentTarget.id.slice(5))});}

/** 在当前浏览器开始新游戏，不发送创建请求。 */
function start(){
 const name=$('name').value.trim().slice(0,18)||'Player One',seed=crypto.getRandomValues(new Uint32Array(1))[0];
 current={...createGame(seed,Date.now()),id:crypto.randomUUID(),name,recorded:false};writeLocal('squeek-rescue-local-name',name);writeLocal(GAME_KEY,current);render();
 $('play').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
}

/** 操作只更新浏览器内存及本机存储，不提交到网络。 */
function action(input){
 if(!current)return;
 try{act(current,input,Date.now(),live);finishShift();render();writeLocal(GAME_KEY,current);}
 catch(error){$('notice').textContent=error.message;}
}

/** 放行按钮和键盘共用同一个本地操作入口。 */
function launch(){action({type:'launch'});}

/** 手摇按钮只调用本机资源逻辑。 */
function pump(){action({type:'pump'});}

/** 键盘操作不抢占昵称输入，忽略系统自动重复按键。 */
function keyControl(event){if(event.target instanceof HTMLInputElement||event.repeat)return;if(event.code==='Space'){event.preventDefault();pump();}else if(event.code==='KeyR')launch();}

/** 页面离开时保存当前局面，不使用后台上传或Beacon。 */
function saveOnLeave(){if(current)writeLocal(GAME_KEY,current);}

/** 跑轮动画和游戏推进都在本机执行，减少不必要的DOM重绘。 */
function animate(now){
 const elapsed=Math.min(50,now-lastFrame);lastFrame=now;
 if(live.available&&Date.now()-Date.parse(live.receivedAt)>120000)renderTelemetry({...live,available:false,status:'UNKNOWN'});
 if(live.available&&live.status==='ACTIVE')wheelAngle=(wheelAngle+elapsed*live.rpm/60000*360)%360;
 $('wheel').style.transform=`rotate(${wheelAngle}deg)`;
 if(current&&!current.finished&&now-lastTick>=150){lastTick=now;advance(current,Date.now(),live);finishShift();render();if(now-lastSaved>=1000){lastSaved=now;writeLocal(GAME_KEY,current);}}
 requestAnimationFrame(animate);
}

buildBoard();restoreLocal();renderScores();
if(current){advance(current,Date.now(),live);finishShift();render();}
$('start').addEventListener('click',start);$('restart').addEventListener('click',start);$('launch').addEventListener('click',launch);$('pump').addEventListener('click',pump);
document.addEventListener('keydown',keyControl);window.addEventListener('pagehide',saveOnLeave);
setInterval(pollTelemetry,2000);void pollTelemetry();requestAnimationFrame(animate);

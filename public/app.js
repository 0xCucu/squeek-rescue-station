import {COLS,ROWS,START,EXIT,WALLS} from './game.mjs';
const $=id=>document.getElementById(id),arrows=['↑','→','↓','←'];let session=null,current=null,polling=false,busy=false,wheelAngle=0,lastFrame=performance.now(),live=null;
/** 调用本站接口，错误以可理解的文字显示，不暴露响应HTML。 */
async function api(path,method='GET',data){
 const response=await fetch(path,{method,headers:data?{'content-type':'application/json'}:{},body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(10000)});
 const result=await response.json();if(!response.ok)throw Error(result.error??'Could not reach the rescue station.');return result;
}
/** 更新官方遥测与鲜活状态，不以旧转速冒充正在跑动。 */
function renderTelemetry(t){
 live=t;$('state').className='status '+(!t.available?'unknown':t.status==='ACTIVE'?'active':'idle');$('state').textContent=!t.available?'Feed unavailable':t.status==='ACTIVE'?'On the wheel':'Resting';
 $('rpm').replaceChildren(document.createTextNode(t.available?t.rpm.toFixed(1):'—'));const unit=document.createElement('em');unit.textContent='RPM';$('rpm').append(unit);
 $('height').textContent=t.settledHeight??'—';$('source').textContent=t.available?(t.provenance==='hardware'?'Real hardware':'Non-hardware'):'Unknown';
 $('feed-note').textContent=t.available?`Sepolia · Observed ${new Date(t.receivedAt).toLocaleTimeString('en-GB',{hour12:false})} · Settled round ${t.settledRound??'—'}`:'Official feed unavailable. Use the hand crank; this shift may be marked as practice.';
}
/** 渲染服务端棋盘和移动中的仓鼠，所有文本使用安全DOM写入。 */
function render(game){
 if(session&&game.id!==session||current?.id===game.id&&game.lastAt<current.lastAt)return;
 current=game;const seconds=Math.ceil(game.remaining/1000);$('timer').textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
 $('rescued').textContent=game.rescued;$('score').textContent=game.score;$('energy').textContent=`${Math.floor(game.energy)} / 60`;$('heat').textContent=`${Math.round(game.heat)}%`;
 $('energy-bar').style.width=`${game.energy/60*100}%`;$('heat-bar').style.width=`${Math.min(100,game.heat)}%`;
 $('mode').textContent=game.finished?'Shift complete':game.telemetry.available?'Live wheel linked':'Hand-crank practice';$('notice').textContent=game.notice;
 $('launch').disabled=game.finished||game.energy<2||game.runners.length>=4;$('pump').disabled=game.finished||game.heat>75;$('restart').hidden=!game.finished;$('start').disabled=!game.finished;$('name').disabled=!game.finished;
 for(let i=0;i<COLS*ROWS;i++){
  const tile=$('cell-'+i);tile.replaceChildren(document.createTextNode(WALLS.includes(i)?'':i===EXIT?'⌂':arrows[game.board[i]]));tile.disabled=game.finished||WALLS.includes(i)||i===EXIT;tile.setAttribute('aria-label',`Row ${Math.floor(i/COLS)+1}, column ${i%COLS+1}, direction ${arrows[game.board[i]]}`);
  if(i===START||i===EXIT){const label=document.createElement('em');label.textContent=i===START?'IN':'HOME';tile.append(label);}
  const runners=game.runners.filter(r=>r.cell===i);if(runners.length){const hamster=document.createElement('span');hamster.className='runner';hamster.textContent='🐹';tile.append(hamster);if(runners.length>1){const count=document.createElement('span');count.className='occupancy';count.textContent=runners.length;tile.append(count);}}
 }
 if(game.finished){session=null;localStorage.removeItem('squeek-rescue-session');void loadScores();}
}
/** 创建棋盘按钮，手机触摸和桌面键盘均可操作。 */
function buildBoard(){
 for(let i=0;i<COLS*ROWS;i++){const tile=document.createElement('button');tile.id='cell-'+i;tile.className='tile'+(WALLS.includes(i)?' wall':'')+(i===EXIT?' exit':'')+(i===START?' entry':'');tile.textContent=WALLS.includes(i)?'':i===EXIT?'⌂':'→';tile.disabled=true;tile.addEventListener('click',()=>void action({type:'rotate',cell:i}));$('board').append(tile);}
}
/** 开始独立服务端对局；刷新页面可恢复同一局。 */
async function start(){
 if(busy)return;busy=true;$('start').disabled=true;
 try{const name=$('name').value.trim()||'Anonymous rescuer';localStorage.setItem('squeek-rescue-name',name);const game=await api('/api/games','POST',{name});session=game.id;localStorage.setItem('squeek-rescue-session',session);render(game);$('play').scrollIntoView({behavior:'smooth',block:'start'});}
 catch(error){$('notice').textContent=error.message;$('start').disabled=false;}finally{busy=false;}
}
/** 按序发送操作，不在网络慢时堆积玩家动作。 */
async function action(input){
 if(!session||busy)return;busy=true;
 try{render(await api(`/api/games/${session}/actions`,'POST',input));}
 catch(error){$('notice').textContent=error.message;}finally{busy=false;}
}
/** 拉取服务端局面，不重建对局，不接受浏览器自行加分。 */
async function pollGame(){
 if(!session||polling||busy)return;polling=true;
 try{render(await api('/api/games/'+session));}
 catch(error){$('notice').textContent=error.message;if(/expired/.test(error.message)){session=null;localStorage.removeItem('squeek-rescue-session');$('start').disabled=false;}}
 finally{polling=false;}
}
/** 显示真实持久化排行榜，不生成假玩家或假成绩。 */
async function loadScores(){
 try{const scores=await api('/api/scores');$('ranking').replaceChildren();if(!scores.length){const empty=document.createElement('p');empty.className='empty';empty.textContent='The first shift is still open. Will your name be the first up here?';$('ranking').append(empty);}
  for(let i=0;i<scores.length;i++){const row=document.createElement('div');row.className='rank-row';const name=document.createElement('span'),rank=document.createElement('span');rank.className='rank';rank.textContent=String(i+1).padStart(2,'0');name.append(rank,document.createTextNode(scores[i].name));if(scores[i].mode==='practice'){const tag=document.createElement('em');tag.textContent='practice';name.append(tag);}const value=document.createElement('strong');value.textContent=`${scores[i].rescued} saved / ${scores[i].score}`;row.append(name,value);$('ranking').append(row);}
 }catch(error){$('ranking').textContent='Rescue board unavailable: '+error.message;}
}
/** 根据实时状态动画跑轮，断流或休息时停止旋转。 */
function animate(now){const elapsed=Math.min(50,now-lastFrame);lastFrame=now;if(live?.available&&live.status==='ACTIVE')wheelAngle=(wheelAngle+elapsed*live.rpm/60000*360)%360;$('wheel').style.transform=`rotate(${wheelAngle}deg)`;requestAnimationFrame(animate);}
buildBoard();$('name').value=localStorage.getItem('squeek-rescue-name')??'';session=localStorage.getItem('squeek-rescue-session');
$('start').addEventListener('click',()=>void start());$('restart').addEventListener('click',()=>void start());$('launch').addEventListener('click',()=>void action({type:'launch'}));$('pump').addEventListener('click',()=>void action({type:'pump'}));
document.addEventListener('keydown',event=>{if(event.target instanceof HTMLInputElement||event.repeat)return;if(event.code==='Space'){event.preventDefault();void action({type:'pump'});}else if(event.code==='KeyR')void action({type:'launch'});});
const stream=new EventSource('/api/live');stream.addEventListener('message',event=>{try{renderTelemetry(JSON.parse(event.data));}catch{$('feed-note').textContent='Could not read this update. Waiting for the next valid sensor message.';}});stream.addEventListener('error',()=>renderTelemetry({available:false,status:'UNKNOWN',rpm:0}));
setInterval(()=>void pollGame(),500);void pollGame();void loadScores();requestAnimationFrame(animate);

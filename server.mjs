import {createServer} from 'node:http';
import {on} from 'node:events';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {createGame,advance,act,normalizeTelemetry} from './game.mjs';

const root=dirname(fileURLToPath(import.meta.url)),dataDir=join(root,'data');
const port=Number(process.argv[2]??18869),host=process.argv[3]??'127.0.0.1';
const games=new Map(),clients=new Set();let scores=[],etag='',lastError='',lastGood=null,lastPoll=0,stopping=false,saveQueue=Promise.resolve();
/** 返回当前遥测，最后成功的数据失效后明确标记断流。 */
function telemetry(){
 if(!lastGood)return {available:false,status:'UNKNOWN',rpm:0,error:lastError||'Connecting to official telemetry'};
 const fresh=lastGood.available&&Date.now()-Date.parse(lastGood.receivedAt)<=120000&&Date.now()-lastPoll<12000;
 return {...lastGood,available:fresh,status:fresh?lastGood.status:'UNKNOWN',error:lastError||null};
}
/** 将JSON写回浏览器并禁止缓存私人局面。 */
function json(res,status,value){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(value));}
/** 持久化非金融排行榜，串行原子替换防止并发完成覆盖。 */
async function persistScores(){
 const body=JSON.stringify(scores,null,2);
 saveQueue=saveQueue.catch(error=>console.error('[排行榜保存异常]',error.message)).then(async()=>{await writeFile(join(dataDir,'scores.json.tmp'),body);await rename(join(dataDir,'scores.json.tmp'),join(dataDir,'scores.json'));});
 await saveQueue;
}
/** 在游戏自然结束时只登记一次成绩，不接受客户端提交分数。 */
async function snapshot(session){
 advance(session.game,Date.now(),telemetry());
 if(session.game.finished&&!session.saved){
  session.saved=true;const g=session.game;
  const entry={name:session.name,score:g.score,rescued:g.rescued,mode:g.practiceSeconds>3?'practice':'live',at:new Date().toISOString()};
  scores.push(entry);scores.sort((a,b)=>b.score-a.score);scores=scores.slice(0,50);await persistScores();
 }
 return {id:session.id,name:session.name,...session.game,telemetry:telemetry()};
}
/** 限制公开接口的请求体大小，拒绝不合法JSON。 */
async function body(req){
 let size=0,text='';for await(const chunk of req){size+=chunk.length;if(size>4096)throw Error('Request too large');text+=chunk;}return JSON.parse(text||'{}');
}
/** 处理独立站点接口与静态资源，不读取任何钱包或密钥。 */
async function handle(req,res){
 res.setHeader('x-content-type-options','nosniff');res.setHeader('referrer-policy','strict-origin-when-cross-origin');res.setHeader('x-frame-options','SAMEORIGIN');
 try{
  const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/healthz')return json(res,200,{ok:true,telemetry:telemetry().available,source:'api.squeekchain.com'});
  if(path==='/api/status'&&req.method==='GET')return json(res,200,telemetry());
  if(path==='/api/scores'&&req.method==='GET')return json(res,200,scores.slice(0,10));
  if(path==='/api/live'&&req.method==='GET'){
   if(clients.size>=200)return json(res,503,{error:'The viewing room is full. Please try again shortly.'});
   res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache','connection':'keep-alive','x-accel-buffering':'no'});res.write(`data: ${JSON.stringify(telemetry())}\n\n`);clients.add(res);return;
  }
  if(path==='/api/games'&&req.method==='POST'){
   if(games.size>=300)return json(res,503,{error:'The station is busy. Please try again shortly.'});
   const input=await body(req),name=String(input.name??'Anonymous rescuer').trim().slice(0,18)||'Anonymous rescuer';
   const id=randomUUID(),seed=Number(BigInt('0x'+id.replaceAll('-','').slice(0,8))),now=Date.now();
   const session={id,name,createdAt:now,game:createGame(seed,now),saved:false};games.set(id,session);return json(res,201,await snapshot(session));
  }
  const match=path.match(/^\/api\/games\/([0-9a-f-]{36})(\/actions)?$/);
  if(match){
   const session=games.get(match[1]);if(!session)return json(res,404,{error:'This shift has expired. Start a new rescue.'});
   if(match[2]&&req.method==='POST')act(session.game,await body(req),Date.now(),telemetry());
   else if(match[2]||req.method!=='GET')return json(res,405,{error:'Method not supported'});
   return json(res,200,await snapshot(session));
  }
  if(req.method!=='GET'&&req.method!=='HEAD')return json(res,405,{error:'Method not supported'});
  const files={'/':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/style.css':['style.css','text/css'],'/game.mjs':['../game.mjs','text/javascript'],'/favicon.svg':['favicon.svg','image/svg+xml']};
  if(!files[path])return json(res,404,{error:'Page not found'});
  const [file,type]=files[path],content=await readFile(join(root,'public',file));res.writeHead(200,{'content-type':type+'; charset=utf-8','cache-control':'no-cache','content-security-policy':"default-src 'self'; connect-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline'; base-uri 'self'; frame-ancestors 'self'"});res.end(req.method==='HEAD'?undefined:content);
 }catch(error){if(!res.headersSent)json(res,400,{error:error.message});else res.end();}
}
/** 全站共享官方遥测轮询，使用ETag与Retry-After，不随玩家数量放大上游流量。 */
async function pollTelemetry(){
 while(!stopping){let wait=2000;
  try{
   const response=await fetch('https://api.squeekchain.com/v1/status',{headers:etag?{'if-none-match':etag}:{},signal:AbortSignal.timeout(8000)});
   if(response.status===429||response.status===503){const seconds=Number(response.headers.get('retry-after'));if(Number.isFinite(seconds)&&seconds>0)wait=Math.min(seconds*1000,60000);throw Error('官方服务暂时限流或不可用');}
   if(response.status===304){lastPoll=Date.now();lastError='';}
   else{if(!response.ok)throw Error('官方API HTTP '+response.status);lastGood=normalizeTelemetry(await response.json());etag=response.headers.get('etag')??'';lastPoll=Date.now();lastError='';}
  }catch(error){lastError=error.message;console.error('[遥测异常]',error.message);}
  const data=`data: ${JSON.stringify(telemetry())}\n\n`;
  for(const client of clients)if(client.destroyed||client.writableLength>65536){clients.delete(client);client.end();}else client.write(data);
  const now=Date.now();for(const [id,s]of games)if(now-s.createdAt>600000)games.delete(id);
  await delay(wait);
 }
}

await mkdir(dataDir,{recursive:true});
try{scores=JSON.parse(await readFile(join(dataDir,'scores.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
const server=createServer();server.listen(port,host);console.log(`[救援站启动] http://${host}:${port}，不读取密钥、不发送链上交易`);
void pollTelemetry();
for await(const [req,res]of on(server,'request'))void handle(req,res);

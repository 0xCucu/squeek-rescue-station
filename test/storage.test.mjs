import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// 静态版只允许读取官方遥测，不能恢复本站写入API或伪装成全站排行榜。
test('静态页面不提交成绩或调用本站API',async()=>{
 const source=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
 const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
 assert.equal(/\/api\/|EventSource|method:\s*['"]POST/.test(source),false,'不应包含本站API或写入请求');
 assert.match(source,/https:\/\/api\.squeekchain\.com\/v1\/status/);
 assert.match(html,/LOCAL SCORES/);
 assert.doesNotMatch(html,/Server-scored/);
 assert.match(html,/0f53135d-c3d9-492a-b487-53f1cd148acf/);
});

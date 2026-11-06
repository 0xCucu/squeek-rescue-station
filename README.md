# Squeek Rescue Station / 仓鼠救援站

squeekchain-project: 0f53135d-c3d9-492a-b487-53f1cd148acf

一个原创的传送带救援小游戏。玩家旋转地砖、安排仓鼠出发并管理蓄电池与手摇发电机。官方跑轮正在活动时，真实 RPM 决定自动发电量；仓鼠休息时不假装继续跑。它不是一个只读看板。

## 运行

需要 Node.js 22 或更新版本，无第三方运行依赖。

```sh
npm test
node server.mjs 18869 127.0.0.1
```

打开 http://127.0.0.1:18869 。生产环境由 Nginx 反代到本机端口。

## 真正实现的功能

- 完整的120秒关卡：旋转、移动、障碍、多人同时引导、资源与热量管理、胜利计分、重玩。
- 服务端游戏引擎：客户端仅提交操作，不能直接提交分数。休闲排行榜不是经济系统或严格反作弊竞赛。
- 服务端原子保存前50名成绩，页面展示前10名；会话最多300个，10分钟后回收。
- 刷新恢复当前对局；移动端触摸与桌面键盘；真实硬件状态的跑轮动画。
- 全站共享官方 API 读取，2秒一次，ETag条件请求、Retry-After处理。断流明确展示未知状态，不把数据缺失当0。
- 接入 `/v1/status` schemaVersion 1；用 `measurement.coreStatus` 与 `freshness` 决定发电；只显示 `builder.anchor` 的已结算高度。带有非硬件provenance的数据明确标注。
- 没有钱包连接、私钥、签名、投注、真实代币或空投承诺。

## Squeekchain集成依据

- https://squeekchain.com/genesis/code
- https://docs.squeekchain.com/developers/api/
- https://api.squeekchain.com/v1/status

目前官方部署为 Ethereum Sepolia 测试环境，不宣称主网或官方背书。官方API中断时仍可手摇继续玩，但超过3秒断流的对局标记为练习。

## Genesis归属验证

本仓库为完整原创源代码。提交前需要把它发布到自己的公开GitHub仓库，并从自己的Genesis账号取得DNS TXT、站点标签与README验证内容。拿到实际内容后分别加入，不能用虚构验证码替代。域名上线不等于官方审核通过。

## 安全与数据

服务仅绑定127.0.0.1；数据库文件只有昵称、分数、获救数量与时间，不保存IP或钱包信息。不要提交 `data/` 到公开仓库。服务器重启后进行中的游戏失效，已完成排行榜保留。

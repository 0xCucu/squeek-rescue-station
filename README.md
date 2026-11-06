# Squeek Rescue Station / 仓鼠救援站

squeekchain-project: 0f53135d-c3d9-492a-b487-53f1cd148acf

一个纯静态的原创像素救援游戏。玩家旋转地砖、安排仓鼠出发并管理蓄电池与手摇发电机。浏览器直接读取官方公开遥测，真实 RPM 决定自动发电量；仓鼠休息时不假装继续跑。

## 运行

生产环境只需静态HTTP托管，不运行Node或Go服务，不需要数据库。游戏、对局恢复和个人成绩都在浏览器执行，不上传成绩。以下命令使用Python标准库进行本地预览；Node仅用于运行测试。

```sh
npm test
python3 -m http.server 18870 --bind 127.0.0.1 --directory public
```

打开 http://127.0.0.1:18870 。生产环境由Nginx直接托管 `public/`，不反向代理应用后端。

## 真正实现的功能

- 完整的120秒关卡：旋转、移动、障碍、多人同时引导、资源与热量管理、胜利计分、重玩。
- 浏览器运行完整游戏引擎，不依赖本站API。
- 个人成绩仅保存当前浏览器的前10名，明确标为LOCAL SCORES；不是全站防作弊榜，用户可以修改或清除自己浏览器的数据。
- 刷新恢复当前对局；移动端触摸与桌面键盘；真实硬件状态的跑轮动画。
- 浏览器直接读取官方公开API，2秒一次，ETag条件请求、Retry-After处理。断流明确展示未知状态，不把数据缺失当0。
- 接入 `/v1/status` schemaVersion 1；用 `measurement.coreStatus` 与 `freshness` 决定发电；只显示 `builder.anchor` 的已结算高度。带有非硬件provenance的数据明确标注。
- 没有钱包连接、私钥、签名、投注、真实代币或空投承诺。

## Squeekchain集成依据

- https://squeekchain.com/genesis/code
- https://docs.squeekchain.com/developers/api/
- https://api.squeekchain.com/v1/status

目前官方部署为 Ethereum Sepolia 测试环境，不宣称主网或官方背书。官方API中断时仍可手摇继续玩，但超过3秒断流的对局标记为练习。

## 安全与数据

没有本站数据写入接口，不连接数据库。服务器只向访客发送HTML、CSS、JS、字体等静态资源。成绩和进行中的对局存储在浏览器localStorage，不发送到服务器。清除浏览器数据会清除本机记录。旧版 `data/` 仅作为保留的历史数据，不再由站点读取或写入，也不要发布到公开仓库。

像素字体为Silkscreen，使用SIL Open Font License；许可文件随静态资源一同提供。

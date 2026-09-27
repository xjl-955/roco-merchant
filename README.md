# 远行商人 · 上新提醒（微信小程序）

《洛克王国：世界》「远行商人」档期助手小程序，支持**实时更新**。打开即可看到：

- 🟢 商人现在是否营业（营业时间：每日 08:00–24:00）
- ⏳ 主倒计时：距本档收摊 / 距下次上新 / 距今早开门
- 🛒 **当日商品卡**：真实图标、价格、限购数和秒级倒计时（在售中/未开始/已结束）
- 🔁 **今日四轮**：每日 08/12/16/20 点四轮刷新，商品按轮次分组展示
- 🔔 **物品提醒**：订阅指定物品，到点上架时小程序内弹窗+震动
- 📅 档期一览：最近 4 期 + 未来全部档期
- 🔄 **实时更新**：自动拉取最新档期，无需发版
- 📖 **精灵图鉴**：621 只精灵，搜索/阶段/属性筛选（数据源：快爆工具箱）
- 🥚 **孵蛋工具**：蛋组查询、全量蛋组表、巢穴摆法推荐
- 🗺️ **地图资源**：快爆地图工具入口（平台限制提供引导式跳转）

## 工具箱功能的数据管线

图鉴与孵蛋数据同样由脚本抓取（`server/fetch-tools.mjs`）：

```
node server/fetch-tools.mjs
   ├─ 精灵图鉴 ← onebiji/hykb_tools/lkwg/jltj/data.php  → public/spirits.json (621只)
   └─ 孵蛋工具 ← onebiji/hykb_tools/lkwg/dzfh/index.php → public/breeding.json (460条蛋组+9摆法)
```

**部署这两个文件**：把 `public/spirits.json` 和 `public/breeding.json`
复制到你已开启 Pages 的仓库（与页面同仓库即可），小程序端
`utils/tools.js` 顶部的 `DEX_URL` / `BREED_URL` 指向对应地址。
数据不常变动，偶尔重跑脚本更新即可。

## 实时更新机制

数据分两层，互补：

**① 档期层**（哪几天有商人、每日总量）——来自 WIKI：

```
wiki.biligame.com/nrc
   │  每天 09:00（北京时间）GitHub Actions 自动执行
   ▼
server/fetch-schedule.mjs   ← 解析「远行商人上新!」全部档案
   ▼
public/schedule.json        ← 提交进仓库，Pages 自动重新发布
   ▼
小程序端 utils/api.js        ← 30分钟缓存TTL + 失败静默回退
```

**② 实时轮次层**（今天每轮卖什么、价格、限购）——来自社区公开 JSON：

```
rocokingdomworld.org/data/merchant.json
   └─（该站服务端从好游快爆工具页定时抓取，每轮更新）
小程序端 utils/live.js       ← 5分钟缓存TTL + 校验 + 失败静默回退
```

实时层失效时自动回退到档期层推算（无轮次明细但仍有商品和倒计时）。

三层兜底，保证永远有数据可看：

| 层级 | 说明 |
|---|---|
| 远程数据 | 打开小程序 30 分钟内有效缓存，过期自动后台拉取 |
| 本地缓存 | 上次成功拉取的数据持久化在本地，秒开无网络依赖 |
| 内置数据 | 打包自带的最小档期表，首次使用/清缓存时兜底 |

手动同步方式：**下拉页面** 或点右上角 **「⟳ 检查更新」**。

## 项目结构

```
roco-merchant/
├── app.js / app.json / app.wxss     # 小程序全局文件
├── project.config.json              # 项目配置（appid 为测试号，需替换）
├── data/schedule.js                 # 内置兜底档期数据
├── utils/
│   ├── merchant.js                  # 档期/营业/倒计时核心逻辑（含数据校验）
│   └── api.js                       # 远程拉取 + 缓存 + 兜底
├── pages/index/                     # 首页（下拉刷新/检查更新）
├── server/fetch-schedule.mjs        # WIKI 抓取脚本（Node 18+，零依赖）
├── public/schedule.json             # 生成的数据文件（托管于 GitHub Pages）
└── .github/workflows/update-schedule.yml  # 每日自动更新工作流
```

## 部署步骤（一次性）

1. **推送到 GitHub 仓库**（Public）
2. **开启 GitHub Pages**：仓库 Settings → Pages → Source 选 `main` 分支 `/public` 目录（或用 Actions 部署整个 `public`）。记下访问地址，如
   `https://<your-name>.github.io/<repo>/schedule.json`
3. **替换数据 URL**：编辑 [utils/api.js](utils/api.js) 顶部的 `DATA_URL`，换成你的 Pages 地址
4. **配置小程序合法域名**：[微信公众平台](https://mp.weixin.qq.com) → 开发管理 → 开发设置 → 服务器域名，把你的 Pages 域名（`https://<your-name>.github.io`）加入 **request 合法域名**
5. 用微信开发者工具导入项目、填入自己的 AppID，上传体验版即可

> 开发调试阶段：开发者工具 → 详情 → 本地设置 → 勾选「不校验合法域名」即可直接测。

## 手动更新数据

```bash
node server/fetch-schedule.mjs   # 重新抓取并生成 public/schedule.json
```

也可在 GitHub 仓库 Actions 页手动触发 *Update merchant schedule* 工作流。

## 内置数据维护

内置兜底数据 [data/schedule.js](data/schedule.js) 仅需在发版时顺手更新，
新档期格式：

```js
{
  start: '2026-11-06 04:00',
  end:   '2026-11-08 23:59',
  goods: [
    { name: '网兜球', daily: 200 }            // 每日固定上架
    // 或限定补货：{ name: '可可果球', extra: [{ date: '11-06', count: 30 }] }
  ]
}
```

## 已知限制

- GitHub Actions 定时任务可能有几分钟到一小时的实际延迟（GitHub 侧调度机制）
- WIKI 有访问频率限制（HTTP 567），脚本已内置 1.2s 间隔 + 指数退避重试 +
  **增量合并**（本次未抓到的档期继承既有数据，永不回退；失败超半数则中止而不产出残缺数据）
- WIKI 页面结构若大幅改版，抓取脚本正则可能需要跟进调整
- 时间逻辑按设备本地时区计算，面向北京时间（UTC+8）用户
- 个人小程序无法主动推送通知；提醒为「打开小程序时」的订阅物品到点弹窗
  （如需微信推送，需申请订阅消息模板，见 `pages/index/index.js` 顶部说明）

## 数据来源与声明

[洛克王国世界WIKI · 远行商人上新档案](https://wiki.biligame.com/nrc/%E8%BF%9C%E8%A1%8C%E5%95%86%E4%BA%BA%E4%B8%8A%E6%96%B0%EF%BC%882026-10-30%EF%BC%89)
（CC BY-NC-SA 4.0），本项目仅供学习交流，非官方作品。

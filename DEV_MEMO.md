# 开发教训备忘（2026-10-07）

## 三次同类事故复盘
1. **reset --hard 丢提交**：处理冲突时丢弃了未推送的本地修复（凌晨+轮次隐藏）
2. **重抓覆盖丢数据**：课题重抓脚本缺 skills 解析，620 只技能被覆盖
3. **index.json 空数组（犯了两次）**：重建时 categories 忘记填充；修复后未同步部署副本导致坏数据又上线

## 防线（已内置到脚本）
- 数据生成：写入前强制校验非空（categories/total 不符即抛异常）
- 数据合并：字段级合并（新缺旧补），禁止整体覆盖
- 修改文件前：先 read 再 edit，改后 node --check 校验
- **双仓库纪律**：改 roco-merchant/public/** 后必须立即 cpSync 到 roco-deploy 并一并提交

## 关键流程纪律
- roco-merchant/public/maps 是源，roco-deploy/maps 是部署副本——两者必须同步提交
- git reset --hard 前必须确认所有本地提交已推送
- 重抓数据脚本必须保留旧字段（合并策略），不能假设新抓的完整
- 修复后立即提交推送，不留未提交状态过夜
- **每次修改 index/数据文件后：读回校验再提交，提交后确认推送到远端**
- **改数据源结构时（如 categories），同步检查所有下游读取代码**

## 小程序环境约束（易错点）
- storage 单键上限 1MB（大文件必须拆分按需加载）
- 无 Node API（fs/child_process 等不能出现在 pages/utils 代码里）
- image 需远程 URL 或 base64，本地路径需在包内
- fine-grained PAT 调 dispatches 需 User-Agent header（Cloudflare Workers fetch 默认不带）

## 当前已知限制
- 地图瓦片用 z=7（16x16），放大 3 倍以上会模糊（z=8 需 1024 张/层，暂不启用）
- WIKI EdgeOne 限流严格：批量抓取需 1.4s+ 间隔，遇 567 冷却 5-10 分钟
- 性别筛选暂无数据源（WIKI 卡片无性别字段）

## 待办提醒
- [ ] 高清瓦片可选升级 z=8（32x32，更清晰但 1024 张/层）
- [ ] 正式发布需自有域名 + ICP 备案（github.io 不可备案）

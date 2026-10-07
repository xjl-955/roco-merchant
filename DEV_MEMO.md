# 开发教训备忘（2026-10-07）

## 三次同类事故的根因
1. reset --hard 丢失未推送提交（凌晨修复+轮次隐藏）
2. 重抓课题时 parseDetail 缺 skills 解析，覆盖丢失 620 只技能数据
3. 重建 index.json 时 categories 空数组（犯了两次！）

## 防线（已内置）
- 数据生成脚本：写入前强制校验非空（categories.length/total 不符则抛异常）
- 数据合并：字段级合并（新缺旧补），禁止整体覆盖
- 修改文件前：先 read 再 edit，改后 node --check 校验
- 多仓库同步：改完 roco-merchant/public 后【必须立即】cpSync 到 roco-deploy 并提交

## 关键流程纪律
- roco-merchant/public/maps 是源，roco-deploy/maps 是部署副本——两者必须同步提交
- git reset --hard 前必须确认所有本地提交已推送
- 重抓数据脚本必须保留旧字段（合并策略），不能假设新抓的完整
- 修复后立即提交推送，不留未提交状态过夜

## 小程序环境约束（易错点）
- storage 单键上限 1MB（大文件必须拆分按需加载）
- 无 Node API（fs/child_process 等不能出现在 pages/utils 代码里）
- image 需远程 URL 或 base64，本地路径需在包内
- fine-grained PAT 调 dispatches 需 User-Agent header（Cloudflare Workers fetch 默认不带）

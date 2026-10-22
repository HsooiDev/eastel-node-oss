# CRONJOBS — 本项目全部定时任务清单

> `crontab.txt` 仅供审核后的排程参考；逐条合并，不要直接导入覆盖现有排程。
> 本文件解释**每个 cron 是做什么的**、需要什么配置、以及服务器上是否已经排上。
> 上服务器路径：Hostinger → Cron Jobs（或 SSH `crontab -e`）。
> 所有 POST 类 cron 都带 header `x-cron-secret: $CRON_SECRET`（值 = `.env.local` 里的 `CRON_SECRET`）。

**共 6 个参考 cron；服务器是否启用及 PHP/Node 归属均待现场核实。** 本次仅更新仓库文件，未增加、删除或执行线上任务。

| # | 名称 | 频率 | 调用 | 做什么 | 服务器状态 |
|---|------|------|------|--------|-----------|
| 1 | WhatsApp Debounce | 每 1 分钟 | `POST /api/whatsapp/debounce` | 处理 `wa_reply_queue`：把客户连发的多条消息合并成一次 AI 回复发出；同时重试 `wa_pending_queue` 失败的回复 | NOT VERIFIED — 历史模板项，需确认归属及实际排程 |
| 2 | WhatsApp Missed | 每 3 小时 | `POST /api/whatsapp/missed` | 扫描没被 bot 回复到的 WA 对话，补救回复 | NOT VERIFIED — 历史模板项，需确认归属及实际排程 |
| 3 | Session 清理 | 每小时 | `POST /api/admin/cleanup` | 删除过期的登录 session 和 email 验证码 | NOT VERIFIED — 历史模板项，需确认归属及实际排程 |
| 4 | 弃单挽回提醒 | 每小时 | `POST /api/orders/abandoned-reminder` | 给下单 3–48 小时仍未付款的订单发提醒（每单只发一次）。**默认关闭** — 要在 `/hs/settings` 把 `abandoned_reminder_enabled` 设为 `1` 才生效；WA 渠道另需 `wa_proactive_enabled=1`（会产生 WA 费用，email 免费） | NOT VERIFIED — 历史新增项，需授权后确认唯一执行方 |
| 5 | Readiness 监控 | 每 5 分钟 | `GET /api/health`（数据库/关键配置不可用时返回 503，失败时直接 curl Telegram Bot API 告警） | 进程或关键依赖不可用时在 5 分钟内通知 admin；独立进程存活检查为 `GET /api/health/live`。**需要先在 crontab 里填** `TG_ALERT_BOT_TOKEN` 和 `TG_ALERT_CHAT_ID`（用 Telegram bot token + admin chat id） | NOT VERIFIED — 历史新增项，需授权后确认唯一执行方 |
| 6 | 媒体清理 | 每天 02:00 | `POST /api/media/cleanup` | 删除 `public/media/wa/` 里超过 30 天的 WhatsApp 媒体文件（对应 PHP 的 `cron-media-cleanup.php`） | NOT VERIFIED — 历史新增项，需授权后确认唯一执行方 |

## 上服务器时的检查步骤

1. SSH 进 Hostinger，`crontab -l` 看现有条目。
2. 先确认 PHP/Node 每项任务的唯一执行方、环境和消息发送授权；获批后才逐条合并上表任务，避免双重处理。本地模板不代表服务器已安装。
3. 确认 crontab 顶部的变量已填好：`CRON_SECRET`（要和服务器 `.env.local` 一致）、`SITE`、`TG_ALERT_BOT_TOKEN`、`TG_ALERT_CHAT_ID`。
4. 记录实际排程和验收日期。旧 Google Sitemap Ping 已废弃，仓库模板已删除；如服务器仍有该条目，另行授权清理。正式 sitemap 通过 robots.txt / Search Console 管理，Staging 不提交。

Google 官方说明：[Sitemaps ping endpoint is going away](https://developers.google.com/search/blog/2023/06/sitemaps-lastmod-ping)。移除失效 ping 不代表搜索引擎已收录。

## Pending-order expiry safety gate

No stale-order expiry cron is enabled. Latest PHP and Node website creation do not reserve stock; both omit product_id and default to source=website. The earlier Node-reservation description was stale. Node redeems vouchers in its create transaction and permits failed→paid retries; PHP failure handling differs. Do not infer a safe terminal state from payment failure or age. TTL, gateway expiry/invalidation, late payments, historical attribution, voucher reuse and cron ownership require explicit decisions; see [source audit](MIGRATION_STATUS.md). No stock restoration or voucher-release cron was added.

## 相关开关（/hs/settings）

| setting_key | 默认 | 说明 |
|---|---|---|
| `abandoned_reminder_enabled` | `0` | 弃单提醒总开关（开了先走免费 email） |
| `wa_proactive_enabled` | `0` | 允许主动发 WhatsApp（弃单 WA 提醒 + 发货 WA 通知）。**免费版 WA 主动发消息要收费**，确定要花钱才开 |

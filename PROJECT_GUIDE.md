# PROJECT GUIDE — 每个功能 / 文件是做什么的

> 给自己（和未来的 AI session）看的功能地图。忘记某个东西是干嘛的，先查这里。
> 技术细节另见：`PROJECT_AUDIT.md`（完整路由/API 对照表）、`MEMORY.md`（坑和规则）、`CRONJOBS.md`（定时任务）、`MIGRATION_STATUS.md`（迁移进度）。

---

## 1. 公开网站（客户看到的）

| 页面 | 路径 | 做什么 |
|---|---|---|
| 首页 | `app/[locale]/page.tsx` | 主落地页：Hero、套餐卡、执照证书、客户评价（三语） |
| 套餐 | `app/[locale]/plans/page.tsx` | 全部套餐对比（月付 + 一次性），含 JSON-LD 结构化数据 |
| Eastelpreneurs | `app/[locale]/eastelpreneurs/page.tsx` | 经销商计划介绍 + 收入计算器 |
| FAQ | `app/[locale]/faq/page.tsx` | 80 条常见问题（7 个分类），含 FAQPage JSON-LD |
| 联系我们 | `app/[locale]/contact/page.tsx` | 联系信息页（没有表单，by design） |
| 下单 | `app/[locale]/order/page.tsx` + `_components/OrderForm.tsx` | 买 SIM 表单：邮编自动判 zone、courier 运费、email OTP 验证、voucher、Turnstile 人机验证 → ToyyibPay 付款 |
| 订单查询 | `app/[locale]/track/page.tsx` + `TrackForm.tsx` | **免登录**查订单：订单编号 + 手机号 → 状态/快递/单号 |
| Thank You | `app/[locale]/thankyou/page.tsx` | 付款后确认页 |
| 法务页 | `delivery` / `privacy` / `terms` | 配送政策、隐私政策、条款 |
| 付款成功（WA 单） | `app/payment/success/page.tsx` | WhatsApp bot 下的单付款后浏览器落地页（三语） |
| 404 / 500 | `app/not-found.tsx`、`app/[locale]/error.tsx`、`app/global-error.tsx` | 品牌化错误页 |
| 客户账户 | `app/[locale]/account/` | (auth): 登录/注册/忘记密码/重置/邮箱验证；(protected): 我的订单/资料/改密码/提交评价 |

全站组件：`components/layout/header.tsx`（导航+语言切换）、`footer.tsx`、`voucher-banner.tsx`（顶部浮动券条：登录有券显示券码，没登录显示注册领券）、`chat-widget.tsx`（AI 客服气泡：快捷 chips + 套餐卡片）、`mobile CTA bar`。

## 2. Admin Panel（/hs/*，全部要登录）

| 页面 | 做什么 |
|---|---|
| `/hs/login` | 管理员登录（Turnstile 保护） |
| `/hs/dashboard` | 总览：订单/营收/客户统计 |
| `/hs/orders` | 订单管理：改状态、填快递单号（改成 shipped 自动发 email 通知客户）、重新生成/重发付款链接 |
| `/hs/customers` + `/[id]` | 客户列表 + 详情 |
| `/hs/products` | 产品（SIM）管理、库存 |
| `/hs/reviews` | 客户评价审核 |
| `/hs/couriers` | 快递公司 + 各区运费 |
| `/hs/zones` | 邮编 → 配送区域（WM/EM/Labuan） |
| `/hs/vouchers` | 券 campaign 管理（welcome 券开关）、已发放列表、手动发券 |
| `/hs/postcode-inquiries` | 「邮编不支持」的客户留资列表（9 种筛选、批量改状态） |
| `/hs/shopee-tracking` | Shopee 订单追踪（对接 SPX Express 查件） |
| `/hs/report` / `/hs/reports` | 详细报表 / 报表仪表盘（可导出） |
| `/hs/marketing-design` | AI 海报设计工具（Gemini 文案 + Imagen 图，画布编辑） |
| `/hs/promo-graphic` | 促销图制作工具 |
| `/hs/product-listing-photos` | 产品上架图制作工具（纯前端） |
| `/hs/video-generator` / `/hs/video-recording` | 产品视频生成 / 录制工具 |
| `/hs/whatsapp` | WA bot 管理：对话、测试 bot、知识库、升级规则、模板 |
| `/hs/telegram` | Telegram bot 管理 |
| `/hs/cloudflare` | CF 管理：DNS、WAF、缓存清理、分析、Token 权限说明 |
| `/hs/ga4` / `/hs/gsc` | Google Analytics / Search Console 数据 |
| `/hs/security` | 登录尝试记录 + **管理员操作审计日志**（谁改了什么订单/产品/设置，和 PHP 共用 `admin_audit_log` 表） |
| `/hs/settings` | 功能开关（switch 界面）+ 全局 key-value 设置（见下面第 6 节） |
| `/hs/guide` | 管理员使用手册 |

## 3. API（app/api/*）

**客户侧：** `auth/*`（注册/登录/忘记密码/OTP，11+ 条）、`orders/create`（下单+开 ToyyibPay bill）、`orders/my`、`orders/zone`（邮编查区）、`orders/track`（免登录查单）、`orders/postcode-inquiry`（邮编留资）、`reviews/*`、`vouchers`（welcome 提示/我的券/验券）、`chat`（网页 AI 客服）。

**付款：** `payment/callback`（ToyyibPay 服务器回调 = 唯一权威；改已付、发确认 email、WA 单发 WA 确认、失败回补库存+退券）、`payment/return`（浏览器跳回）、`payment/check-payment`（Pay Now 按钮查真实状态）、`payment/pay-again`（重新去付款）、`payment/check-dnqr`（DuitNow QR 状态）。

**Admin：** `admin/*` 每个 admin 页面对应一条（登录 JWT + CSRF 保护）。特别的：`admin/orders/regenerate-payment`（重开 bill）、`admin/orders/resend-payment`（重发付款链接）、`admin/cleanup`（cron 清 session）。

**集成：** `whatsapp/webhook`（Meta 消息进来 → AI 回复）、`whatsapp/debounce`+`missed`（cron）、`telegram/webhook`、`cloudflare/purge`、`upload`、`media`（WA 媒体文件）、`media/cleanup`（cron）、`orders/abandoned-reminder`（cron）、`translations`、`health`（uptime 探针）。

## 4. lib/（共用模块）

| 模块 | 做什么 |
|---|---|
| `db.ts` | MySQL 连接池（和 PHP 共用同一个数据库！别乱改 schema） |
| `migrate.ts` | 建表/加字段（幂等，启动自动跑）+ 种默认 settings |
| `auth.ts` / `session.ts` / `cookies.ts` | 客户认证（jose JWT）、兼容 PHP bcrypt 旧密码 |
| `validation.ts` | 所有 API 输入的 Zod 校验 |
| `rate-limit.ts` | 内存滑动窗口限流（登录、track 查询等） |
| `security.ts` | HTML 消毒、CSRF |
| `toyyibpay.ts` | ToyyibPay 开 bill / 查交易（**billAmount 单位是分！**） |
| `vouchers.ts` | 券逻辑：算折扣、发码、welcome 券、验证、核销（防双花） |
| `email.ts` + `email-templates.ts` | SMTP 发信：OTP、重置密码、订单确认、发货通知、弃单提醒（三语模板） |
| `whatsapp/client.ts` | WA Cloud API 封装（20 个函数） |
| `whatsapp/ai.ts` | WA bot 大脑：去重、限流、debounce、升级、还能直接帮客户下单开 bill |
| `telegram/client.ts` + `notifications.ts` | TG bot + admin 通知（订单已付/失败、bot 没回复、**服务器报错告警**） |
| `ai/gemini.ts` | 共用 Gemini 客户端（WA/TG/网页客服共用） |
| `google/oauth2.ts` + `ga4.ts` + `gsc.ts` | Google service account 拿 token（按 env var 分开缓存）→ GA4/GSC 数据 |
| `cloudflare.ts` | CF API 封装（token 不出后端） |
| `site.ts` | `SITE_URL` 唯一来源（`NEXT_PUBLIC_SITE_URL`，fallback `https://eastel.site`）— **别再硬编码域名** |
| `i18n*.ts` + `locales/*.json` | 三语翻译（en/ms/zh） |
| `plans-data.ts` / `reviews-data.ts` | 套餐静态数据（含 JSON-LD 用）/ 评价数据 |
| `queries/*` | 按领域拆分的 DB 查询（customers/orders/products/settings） |

## 5. 根目录关键文件

| 文件 | 做什么 |
|---|---|
| `instrumentation.ts` | 服务器报错自动发 Telegram（限流 10 分钟/同错误） |
| `crontab.txt` | 7 个 cron 的排程源（详见 `CRONJOBS.md`） |
| `.github/workflows/deploy.yml` | push main → lint+build → SSH 部署 → 健康检查 → 4 页冒烟测试 |
| `public/robots.txt` | robots 唯一来源（直接改它；Cloudflare 会再叠加规则） |
| `app/sitemap.ts` | 动态 sitemap（10 页 × 3 语言） |
| `ecosystem.config.js` / `nginx.conf` | PM2 / Nginx 配置 |
| `.env.example` | 全部环境变量清单（新 key 记得同步） |

## 6. 功能开关（/hs/settings 里的 setting_key）

| key | 默认 | 说明 |
|---|---|---|
| `abandoned_reminder_enabled` | `0` | 弃单 email 提醒（免费） |
| `wa_proactive_enabled` | `0` | 主动 WA 消息总闸（弃单 WA + 发货 WA）。**要花钱，想清楚再开** |
| `duitnow_qr_enabled`（payment_settings 表） | — | 下单时是否开 DuitNow QR 支付 |

## 7. 重要业务规则速查

- 数据库和 PHP 生产站**共用** — 改 schema 只能通过 `lib/migrate.ts` 加可空字段/新表。
- ToyyibPay 金额单位是**分**（RM35 = 3500）；callback 比浏览器跳转先到、可能重复，用 `WHERE payment_status='pending'` 保证幂等。
- WA 手机号存库**不带 +**；Meta webhook 会重复投递，靠 `whatsapp_processed` 去重。
- 注册时自动发 welcome 券（有开着的 welcome campaign 才发）；券在下单事务里原子核销，付款失败自动退回。
- 皮肤已定稿（2026-07-11）：`globals.css` 的 OLD-DESIGN 块永久保留，**不要删、不要换肤**。
- 部署：commit 到 `development`；merge 到 `main` = 自动部署生产（build 期间下线 5-10 分钟）。

# 在 AI 中选购 Eastel SIM

此功能让已连接 Eastel 工具的 ChatGPT、Claude 和其他 AI 客户端查询现价、推荐配套，并准备购买一张实体 SIM 的结账链接。默认使用 AI 辅助填写模式：顾客自愿提供联系和配送资料后，AI 可以生成预填表单的私人链接；顾客也可以选择完全在网站上填写。

**付款仍需顾客亲自确认。** 顾客打开链接、核对资料和最终费用、完成邮箱验证与 CAPTCHA，再进入 ToyyibPay/FPX 授权付款。这些工具调用不会创建订单、生成付款账单、扣款、预留库存或开通配套。本站支持只买实体 SIM，或另付套餐费购买 SIM＋套餐代购；下单时记录套餐和金额，顾客收到卡并在 App 注册后，由 Eastel 手动代购开通。

这是商家的工具连接接口。它不会让商品自动出现在所有 ChatGPT/Claude 对话或平台商店，也没有接入平台原生的聊天内支付。要使用该功能，AI 客户端或其运营者须先配置下面一种连接。

## 接口

部署后的域名使用现有 `NEXT_PUBLIC_SITE_URL` 配置；下表以 `https://eastel.site` 举例。如果 Node.js 部署在其他域名，请使用实际部署域名，并让该变量与之匹配。普通 PHP 站点不会自动拥有这些 Node.js API。

| 接口 | 用途 |
| --- | --- |
| `POST /api/mcp` | 官方 MCP SDK 实现的无状态 Streamable HTTP 服务 |
| `GET /api/ai/openapi` | 动态 OpenAPI 3.1 描述，供 GPT Actions 或其他 REST 工具连接使用 |
| `GET /api/ai/catalogue?locale=zh` | 当前实体 SIM 价格、可售状态和可推荐配套 |
| `POST /api/ai/recommend` | 根据用量和配套预算推荐配套 |
| `POST /api/ai/checkout` | 生成 AI 辅助填写或网站自行填写的结账链接 |

三种工具的名称在 MCP 和 OpenAPI 中一致：`eastel_get_catalogue`、`eastel_recommend_plan`、`eastel_prepare_checkout`。`locale` 支持 `en`、`ms`、`zh`，省略时为 `ms`。动态 OpenAPI 和 MCP 工具描述是参数、默认值和校验规则的准确来源。

## ChatGPT：Custom GPT Actions

在支持创建带 Actions 的 Custom GPT 账号中，创建或编辑 GPT，并为其添加 Action。导入已部署的 OpenAPI URL，例如 `https://eastel.site/api/ai/openapi`，认证选择 **None**。该接口只读取公开商品资料或准备结账链接，不使用顾客账号和平台 API 密钥。

为 GPT 配置实际部署站点的隐私政策链接，例如 `https://eastel.site/en/privacy`；发布或分享 GPT 时遵守平台当时的要求。确认导入后可以看到上述三个操作，并在 Actions 测试界面执行查询、推荐和结账链接生成。该配置与部署是上线步骤，代码修改本身不会创建或发布一个 GPT。

可使用以下 GPT 指令作为起点：

```text
帮助顾客购买一张 Eastel 实体 SIM。先调用 eastel_get_catalogue 读取现价和可售状态。
顾客需要配套建议时，调用 eastel_recommend_plan，说明热点共享规则、用量差距和超预算金额。
配套价不包含 SIM 或运费。让顾客选择只买 SIM，或 SIM 加配套代购。
顾客选配套代购时传 plan_id 和 purchase_option="sim_and_plan"，清楚说明另加配套费用。
只买 SIM 时传 purchase_option="sim_only"；不要把推荐当成已购买或已开通。
顾客下单后，所购配套和费用会保存；收到 SIM 并在 App 注册后，由 Eastel 手动代购。
默认提供 AI 辅助填写；顾客自愿授权时，只收集工具 schema 允许的联系和配送资料。
顾客选择在网站填写时，调用 eastel_prepare_checkout，checkout_mode="website"，不收集或发送 details。
严禁请求密码、验证码、银行卡资料、银行登录资料或 CAPTCHA token。
准备链接后，把 checkout_url 作为私人链接交给顾客，提醒核对资料和最终费用。
说明顾客须在网站完成验证和亲自授权付款；收到链接不是下单成功或付款成功。
不得编造运费、最终总价、库存保留或已付款状态。
```

## Claude 和其他 MCP 客户端

在支持自定义远程 MCP 服务的客户端或 Claude 账号中，添加实际部署的 URL，例如 `https://eastel.site/api/mcp`。使用 **Streamable HTTP** 传输；本服务无持久会话，按 MCP 协议初始化、发现工具并调用工具即可。不需要填写 Eastel 顾客凭据。

客户端须支持远程 Streamable HTTP 的 POST 请求和 JSON 响应。MCP POST 请求的 `Accept` 应包含 `application/json, text/event-stream`；`Content-Type` 为 `application/json`。服务器没有长期事件流，GET 和 DELETE 返回 `405` 是预期行为。客户端还应发送其协商的 MCP 协议版本。

具体连接入口和可用账号类型取决于提供商当前功能。其他 AI 应用可使用同一个 MCP 服务，或按 OpenAPI 配置 REST 工具。部署接口并不会自动配置提供商的连接器。

## REST 示例

先查询实时目录，然后使用目录返回的 `plan.id`：

```bash
curl 'https://eastel.site/api/ai/catalogue?locale=zh'

curl 'https://eastel.site/api/ai/recommend' \
  -H 'Content-Type: application/json' \
  --data '{"locale":"zh","dataGB":100,"hotspotGB":20,"roamingGB":0,"budget":35,"minValidityDays":30}'

curl 'https://eastel.site/api/ai/checkout' \
  -H 'Content-Type: application/json' \
  --data '{"locale":"zh","plan_id":"ez35","purchase_option":"sim_and_plan","checkout_mode":"website"}'
```

默认 `checkout_mode` 是 `assisted`。该模式可接收可选 `details` 对象，必填字段为 `full_name`、`email`、`phone`、`address_line1`、`postcode`、`city`、`state`，可选字段为 `alt_phone`、`address_line2`。手机号须符合马来西亚号码格式，邮编须为五位数字，州属须使用 schema 列出的名称。顾客未提供 `details` 时，生成普通结账链接。

`purchase_option` 支持 `sim_only` 和 `sim_and_plan`。省略时，有 `plan_id` 会准备 SIM 加配套代购，没有 `plan_id` 则只买 SIM；显式 `sim_only` 永远不计套餐费。购买套餐须提供当前可售 ID，否则拒绝准备结账。结账页面列出并允许切换两种选择。旧的 `/order?plan=...` 推荐链接默认只买 SIM；新增链接以 `purchase=sim_and_plan` 明确选择套餐代购。

`estimated_charges` 分别返回 SIM 费、所选套餐费，运费和总额待网站核实。正式下单只提交套餐 ID 及可选的已确认报价比较值 `plan_price_cents`；服务端从当前目录计算收费，客户提供的价格不能覆盖收费。若目录改价，409 `plan_price_changed` 会要求重新确认。优惠券继续仅抵扣 SIM 和运费，套餐代购费完整收取。

## 数据库记录、后台和顾客 invoice

订单新增四个字段：`plan_snapshot`（下单时不可变的套餐 ID、名称、价格、流量/热点/漫游/有效期快照）、`plan_fee`（单独收取的套餐费用）、`plan_fulfilled_at`、`plan_fulfilled_by`。选择只买 SIM 时，快照为 NULL、套餐费为零；历史订单不从当前目录推断或补造套餐。

后台 Orders 和 CSV 显示所购套餐、费用及代购完成记录。收到付款并在自己的 App 完成购买后，管理员可以登记“已代购”；该操作有登录/CSRF保护、审计和重复请求保护。它只记录人工操作，不会调用运营商购买接口。未付款或已取消订单不能登记完成。

顾客订单、确认页、邮件和新 `/[locale]/account/orders/[id]/invoice` 显示 SIM、套餐、运费、折扣和总额。Invoice 支持打印/PDF，须登录且订单属于当前顾客。待付款记录明确显示未付款；顾客不能靠链接查询其他人的订单。

顾客授权提供的资料会加密放在链接的 URL fragment 中，15 分钟后过期；不会直接作为查询参数发送。浏览器从链接恢复表单后清除 fragment。该链接持有者在有效期内可恢复对应的资料，因此只发给相关顾客，不写入日志、分析事件或公开示例。顾客选择 `website` 时，不应收集资料；该模式同时提交 `details` 会被拒绝。网站浏览器使用的 `/api/ai/checkout-details` 是内部表单交接接口，未列入 AI 工具发现。

响应沿用项目格式：成功为 `{ "status": "success", ... }`；错误为 `{ "status": "error", "code": "...", "message": "..." }`。结账响应包含 `checkout_url`、`checkout_mode`、`details_prefilled`、`details_expire_in_seconds` 和 `customer_action_required: true`，同时明确 `order_created: false`、`payment_completed: false`。`estimated_charges.shipping_fee` 和 `total` 为 `null`，须在网站选配送方式后核实最终金额。

## 运行与验证

复用现有数据库、`NEXT_PUBLIC_SITE_URL`、`JWT_SECRET`、邮箱/OTP、Turnstile 和 ToyyibPay 配置，新增订单字段由现有初始化器幂等添加；部署时先确认迁移成功再开放新订单流量，不新增数据库表或 AI 提供商密钥。AI 本身由所连接的客户端提供。辅助填写使用现有 `JWT_SECRET` 派生的独立加密密钥；生产域名须使用 HTTPS，密钥不足或不可用时会拒绝生成预填链接。数据库须有可售 SIM、可用库存和启用的配送商，保存的推荐目录须有效。

读取实时数据库失败或推荐目录损坏会返回不可用状态，不会使用过时的配套冒充当前可售商品。停售配套和缺货商品无法生成有效结账链接。公开接口限制每个代理解析 IP 每分钟 60 次请求；REST 接口共享计数，MCP 单独计数，计数为进程内存级。部署时必须确保可信代理清理或覆盖客户端自带的 IP 头；多实例部署可在网关统一限流。

请求体最多 16 KiB，必须是 `application/json`，参数和资料对象拒绝未知字段。带 `Origin` 的 POST 仅接受配置的站点 origin；提供商服务端调用通常省略 `Origin`。所有响应 `Cache-Control: no-store`；API 无通配 CORS。

上线前运行项目 build、lint 和回归检查，再在实际 HTTPS 域名完成三种语言的目录/推荐/链接测试、AI 辅助预填与网站自行填写测试、过期/篡改链接测试、邮箱验证、CAPTCHA 和一次真实付款流程。真实支付、提供商账号连接以及公开发布须按商家现有上线流程完成；本地 API 测试不能代替这些检查。

相关自动化检查使用实际 TypeScript 模块、夹具数据库和官方 MCP 客户端，不访问真实顾客资料或创建订单：

```bash
node scripts/verify-ai-commerce.mjs
node scripts/verify-ai-commerce-http.mjs
```

## 本地验证记录（2026-10-13）

`npm run test:ai` 共 54 项测试通过；原有 core/migration 回归通过。生产 webpack 构建和 TypeScript 通过，ESLint 为 0 错误、50 个原有警告。官方 MCP SDK 客户端已通过真实 HTTP 完成初始化、发现工具、读取实时推荐和拒绝不可用结账。

Chromium 在开发和生产 standalone 模式下验证：AI 资料代填、移除私密片段、游客快递读取、实时 SIM 价格与配送总额、无效链接回退。验证只使用隔离本地数据库里的临时虚构商品/快递/邮编记录，结束后已清除；没有提交真实支付订单、创建真实支付账单或扣款。新增的隔离 MariaDB 检查运行实际订单 handler，并以模拟网关验证 SIM＋套餐及 SIM-only 的实存金额、invoice 所属权和人工代购审计；临时订单、账号、会话及商品记录已清除。

Standalone 本地运行需要复制 `public` 和 `.next/static` 到输出目录，并通过部署环境注入变量；本次本地验证使用 `node --env-file=.env.local .next/standalone/server.js`。不要假定构建输出含有 `.env.local`，不要把真实密钥提交或复制到公开目录。生产服务必须使用与 build 时 `NEXT_PUBLIC_SITE_URL` 一致的公开域名。

本地检查不证明已连接真实 ChatGPT/Claude 账号、已公开发布或已完成 SMTP、CAPTCHA、ToyyibPay/银行付款验证。这些仍属于上线步骤。

相关规范：[GPT Actions](https://platform.openai.com/docs/actions/introduction)、[MCP Streamable HTTP](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)、[Anthropic MCP 文档](https://docs.anthropic.com/en/docs/mcp)。

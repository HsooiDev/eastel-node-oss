# Public search and AI crawler policy

Verified against official documentation on **2026-10-15**. This is a policy and source record, not evidence that any provider has indexed or recommended the website. No Cloudflare setting or live server configuration was changed by this work.

## Purpose and defaults

Production public information should be crawlable for search and user-requested retrieval. Training remains restricted. Staging remains noindex and must not submit URLs to search services. Authentication, authorization, request limits, private-page no-store, CAPTCHA and webhook verification continue to apply to every visitor, including verified bots.

| Official token | Purpose | Production public pages | Verification source |
| --- | --- | --- | --- |
| `Googlebot` | Google Search, including eligibility for AI Overviews/AI Mode | Allow crawling and snippets | Google's common-crawler IP list or reverse **and** forward DNS verification |
| `Bingbot` | Bing Search discovery/indexing | Allow | Bing's current IP list, Verify Bingbot, or reverse **and** forward DNS verification |
| `OAI-SearchBot` | ChatGPT Search discovery | Allow | OpenAI `searchbot.json` |
| `ChatGPT-User` | User-triggered retrieval; does not determine Search inclusion | Allow public retrieval | OpenAI `chatgpt-user.json` |
| `PerplexityBot` | Perplexity search discovery; not foundation-model training | Allow | Perplexity `perplexitybot.json` |
| `Perplexity-User` | User-triggered retrieval; not foundation-model training | Allow public retrieval | Perplexity `perplexity-user.json` |
| `Claude-SearchBot` | Claude search indexing/relevance | Allow | Anthropic's published crawler IP list or Cloudflare verified identity |
| `Claude-User` | Claude user-triggered retrieval | Allow public retrieval | Anthropic's published crawler IP list or Cloudflare verified identity |
| `GPTBot` | Potential foundation-model training | Disallow | OpenAI `gptbot.json`; do not confuse it with SearchBot |
| `ClaudeBot` | Potential model training | Disallow | Anthropic crawler documentation; token has **no hyphen** |
| `Google-Extended` | Gemini training **and some Gemini/Vertex grounding uses** | Keep disallowed pending a separate owner decision | A robots product token, not a distinct HTTP User-Agent |

Sources and official identity lists:

- [Google: AI features and your website](https://developers.google.com/search/docs/appearance/ai-features): normal Search technical requirements apply; pages need indexing/snippet eligibility; no special AI text file or schema is required. Search Console includes AI-feature traffic in overall Web performance and does not provide a separate citation count here.
- [Google: common crawlers](https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers): Google-Extended controls Gemini training and specified grounding uses; it does not affect Google Search inclusion or ranking. Keeping it blocked can limit those Gemini uses even while Google Search/AI Mode remains eligible.
- [Google: verify crawler requests](https://developers.google.com/crawling/docs/crawlers-fetchers/verify-google-requests), [current common-crawler ranges](https://developers.google.com/static/crawling/ipranges/common-crawlers.json). Use the crawler-specific current lists, rather than all Google Cloud address space.
- [Bing: which crawlers Bing uses](https://www.bing.com/webmasters/help/which-crawlers-does-bing-use-8c184ec0), [verification instructions](https://www.bing.com/webmasters/help/how-to-verify-bingbot-3905dc26), [published IP list](https://www.bing.com/toolbox/bingbot.json). The verification page requires a reverse lookup ending in `.search.msn.com` and a forward lookup back to the requesting IP, or the current published list. Re-fetch rather than freezing a historic list in WAF code.
- [OpenAI: crawler overview](https://developers.openai.com/api/docs/bots), [SearchBot ranges](https://openai.com/searchbot.json), [ChatGPT-User ranges](https://openai.com/chatgpt-user.json), [GPTBot ranges](https://openai.com/gptbot.json). Search and training preferences are independent. OpenAI notes that user-triggered fetches may not follow robots.txt; Search visibility is controlled with OAI-SearchBot.
- [Perplexity: crawler documentation](https://docs.perplexity.ai/docs/resources/perplexity-crawlers), [search ranges](https://www.perplexity.com/perplexitybot.json), [user-fetch ranges](https://www.perplexity.com/perplexity-user.json). Its user fetcher generally ignores robots.txt. Their WAF example combines the correct User-Agent with current published IP ranges; this project additionally limits any exception to public read-only paths and retains other security enforcement.
- [Anthropic: crawlers and site-owner controls](https://privacy.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler), [published crawler ranges](https://claude.com/crawling/bots.json). Anthropic documents robots.txt and optional Crawl-delay; do not rely on legacy misspellings such as `Claude-Bot` as the training control.

## Robots and HTTP signals

Keep public-search agents and `*` in one shared robots group containing the private-path exclusions. A separate bot-specific `Allow: /` group can otherwise cause that bot to ignore the general private-path rules. Robots is advisory: it does not secure API, account, payment or admin content.

Do not use `Disallow: /` as staging's only noindex control. A crawler blocked from fetching a page cannot see that page's noindex directive. Public previews serve noindex in both initial HTML and `X-Robots-Tag`; the staging proxy also enforces it on redirects, errors and static assets. [Google's robots/header specification](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag) explains the crawl requirement and the restrictive combination of directives.

`noai, noimageai` is not a portable replacement for provider-specific training controls or noindex. Those values are absent from Google's documented supported serving rules, and this audit did not establish uniform support across the requested providers. Remove the blanket header and express the confirmed training restrictions with their documented tokens. Do not add global `nosnippet`, which limits Google Search AI use and snippets.

## Cloudflare review before release

Inspect effective zone and origin rules through an authorized operational review before changing them. Source policy alone does not establish provider-IP access.

1. Review [AI bot policies](https://developers.cloudflare.com/bots/additional-configurations/block-ai-bots/) and [AI Crawl Control per-crawler actions](https://developers.cloudflare.com/ai-crawl-control/features/manage-ai-crawlers/). Current docs distinguish **Search**, **Agent**, and **Training** behavior; mixed training/search crawlers can still be blocked by training policy. Future production public paths should allow the requested search and retrieval behavior while keeping training restricted. Do not disable WAF, DDoS or security rules globally.
2. Use [Cloudflare verified bots](https://developers.cloudflare.com/bots/concepts/bot/verified-bots/) / [`cf.client.bot`](https://developers.cloudflare.com/ruleset-engine/rules-language/fields/reference/cf.client.bot/) as verified identity, or match a provider's current CIDR list **and** correct agent token. A User-Agent match alone is never authorization. Category availability and any newer taxonomy must be checked against the actual account before creating an expression.
3. Only consider a narrow false-positive exception for the public content allowlist, GET/HEAD and the verified provider. Keep API, account, admin, orders, uploads, callbacks and token-bearing URLs outside it. Preserve rate limits and application checks. A verified bot does not need privileged access.
4. [Bot Fight Mode](https://developers.cloudflare.com/bots/get-started/bot-fight-mode/) cannot be bypassed by WAF Skip rules. Diagnose Security Events first. Do not promise that a UA allow rule can bypass it, and do not disable protection merely to chase visibility.
5. Inspect the **actual HTTP robots.txt**, including Cloudflare's [managed robots/Bot Preference Sync](https://developers.cloudflare.com/bots/additional-configurations/managed-robots-txt/) and [Content Signals](https://developers.cloudflare.com/ai-crawl-control/features/track-robots-txt/). A managed group can override the origin's intended behavior. Do not let a zone-wide `ai-input=no` contradict the requested public AI retrieval policy; do not represent Content Signals as universally implemented crawler requirements.
6. Keep `staging.example.test` behind a separately scoped Access policy when practical, with noindex defense in depth. Public-preview mode must retain noindex and no-store.

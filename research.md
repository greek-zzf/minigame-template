# 网页小游戏站调研（2026-10-13）

## 数据来源说明
- **月访问量**：TrendBreakouts 站点页（`trendbreakouts.com/site/<域名>`，基于 Similarweb 月度估算，榜单注明数据截至 2026 年 7 月），2026-10-13 抓取。
- **US 自然流量**：PixelGamesHub《State of Browser Games 2026》公开数据集（Semrush US 库，快照 2026-05-20），只覆盖部分站点，没有数据的留空。
- 原计划使用的 webcafe-seo MCP 因**积分余额为 0** 调用失败（未扣费），所以本表没有该来源的数据。
- 所有数字都是第三方估算，只看量级。

## 30 个站点

| # | 域名 | 类型 | 月访问量 (Similarweb/TB) | US 自然流量 (Semrush) | 备注 |
|---|---|---|---|---|---|
| 1 | poki.com | 聚合门户 | 193M | 284.7M | 龙头；游戏页有 FAQPage/ItemPage schema，自研 SDK + 广告 |
| 2 | crazygames.com | 聚合门户 | 102M | 113.6M | 第二；分类页拿 "action games" 这类头部词；开发者平台 |
| 3 | itch.io | 独立游戏平台 | 63M | 16.6M | 独立开发者发布平台，AI 引用最多 |
| 4 | eatcells.com | 单游戏/.io | 50M | | 吞噬类 .io 游戏 |
| 5 | sudoku.com | 单品类 | 42M | | 数独；Easybrain 出品，广告变现 |
| 6 | boardgamearena.com | 桌游平台 | 31M | | 在线桌游，订阅制 |
| 7 | solitaired.com | 单品类 | 26M | | 纸牌；首页就是游戏，下面是长篇 How to Play |
| 8 | geoguessr.com | 单游戏 | 18M | | 订阅制 |
| 9 | playhop.com | 聚合门户 | 17M | | Yandex Games 国际站 |
| 10 | friv.com | 聚合门户 | 10M | | 老牌，主打 "unblocked" |
| 11 | bloxd.io | 单游戏/.io | 10M | | 方块类 .io |
| 12 | coolmathgames.com | 聚合门户 | 9M | 13.9M | 主打学生/学校场景 |
| 13 | neal.fun | 创意小站 | 9M | | 个人开发者的创意互动小游戏集合，靠社交传播 |
| 14 | y8.com | 聚合门户 | 8M | 8.8M | 游戏页带 VideoGame schema、长 FAQ |
| 15 | minesweeper.online | 单品类 | 7M | | 扫雷；有排名/社区 |
| 16 | lagged.com | 聚合门户 | 5M | 315.7K | title 用 "X Game - Play on Lagged"，描述带 unblocked |
| 17 | arkadium.com | 休闲门户 | 5M | | 纸牌/麻将/拼图 |
| 18 | orteil.dashnet.org | 单游戏 | 5M | | Cookie Clicker |
| 19 | play2048.co | 单游戏 | 4M | | 2048 原版 |
| 20 | wordleunlimited.org | 单游戏 | 4M | | Wordle 克隆，H1 + 规则说明 + AdSense |
| 21 | kongregate.com | 聚合门户 | 3M | | 老牌 Flash 门户 |
| 22 | armorgames.com | 聚合门户 | 3M | | 老牌 |
| 23 | krunker.io | 单游戏/.io | 3M | | FPS .io |
| 24 | agar.io | 单游戏/.io | 3M | | .io 鼻祖 |
| 25 | smashkarts.io | 单游戏/.io | 3M | | |
| 26 | gameflare.com | 聚合门户 | 2M | 561.6K | 靠 Sprunki 系列 phase 页面吃长尾 |
| 27 | shellshock.io | 单游戏/.io | 2M | | |
| 28 | silvergames.com | 聚合门户 | 1M | 524.7K | VideoGame + AggregateRating schema |
| 29 | addictinggames.com | 聚合门户 | 1M | | |
| 30 | gamesnacks.com | 聚合门户 (Google) | 1M | 334K | Google 出品的轻量 H5 游戏 |

参考（没有列入 30 个）：miniclip.com 1M、1001games.com 950K、kizi.com 647K、littlealchemy2.com 543K、gamepix.com 504K/190K(US)、slither.io 489K、paper-io.com 342K、1v1.lol 278K、dinosaur-game.io 120K、games.co.uk 103K。

## 页面模式总结（实际抓取了 poki、crazygames、y8、lagged、silvergames、solitaired、friv、wordleunlimited、play2048、minesweeper.online；coolmathgames 有 Cloudflare 拦截）

1. **首屏就是游戏**：游戏区（iframe/canvas）占首屏主体，下面一条工具栏：游戏名 H1、全屏、点赞/评分。门户通常先显示封面 + 「Play」按钮，点击后才加载游戏（对速度友好，也方便插 preroll 广告）。
2. **游戏下面放长文本做 SEO**：About / How to Play / Controls / Tips / FAQ（poki 的 Subway Surfers 页有 6 个以上 H2；y8 用 "What is X about? / Who is X for?" 这种问答式 H2；solitaired 首页下面是 How to Play + Strategies）。
3. **大量内链**：侧栏或下方「Similar / Related Games」网格、热门分类、标签、面包屑。分类页（"X games"）是门户最主要的流量入口（crazygames 的 action/simulator games 排第 1）。
4. **URL 结构**：单层短 slug：`/g/<slug>`（poki、lagged）、`/game/<slug>`（crazygames）、`/games/<slug>`（y8）、`/en/<slug>`（silvergames）；分类用 `/t/<tag>` 或 `/category/x`；多语言用路径前缀 `/en/`。
5. **结构化数据**：VideoGame（y8、silvergames）或 ItemPage，加上 BreadcrumbList、AggregateRating、FAQPage（poki、crazygames）、WebSite+SearchAction；都有 canonical 和 og:image。title 模板一般是「<Game> - Play Online for Free | <Brand>」，description 第一句写玩法，常带 "free / unblocked / no download"。
6. **变现**：Google Ad Manager/GPT（googletag 出现在 9/10 个页面）、AdSense、Prebid 竞价、AFG（AdSense for Games，preroll/插屏）；门户做 728x90 / 300x250 / 侧栏摩天楼。单游戏站一般就是 AdSense + 1~2 个展示位。
7. **移动端和全屏**：都有全屏按钮；移动端游戏区自适应，横屏游戏会提示旋转。单游戏站（2048、wordle、扫雷）首页就是游戏本身，没有封面，直接开玩。

## 对独立开发者的启示
- 头部品牌词（poki、crazygames）抢不过，应该做**单游戏站 / 垂直品类站**（参考 sudoku.com、solitaired、minesweeper.online、play2048），或在门户上做长尾词：游戏名、"<game> unblocked"、"<game> online"、系列作品的分 phase 页（gameflare 的 Sprunki 打法）。
- 每个游戏页要写足原创文字，并把 schema（VideoGame/FAQ/Breadcrumb）补全。
- 第三方游戏可以用 GameDistribution / GamePix 的嵌入来快速铺量，原创游戏更容易拿到品牌词。

## 补充：多语言与广告
- 头部站点都做多语言：抓取样本中 poki（`/en/g/...`）、silvergames（`/en/...`）都用语言路径前缀。模板采用「默认英文放 `/`，其他语言放 `/zh/` 等前缀」，再加 hreflang 和 sitemap 里的 alternate，对 SEO 最干净。
- 抓取的 10 个站点里有 9 个用了 Google Ad Manager 的 GPT（googletag），单游戏站多数用 AdSense。所以模板两种都支持：起步阶段用 AdSense，流量上来后切换到 GAM（可接入 AdX / Prebid）。

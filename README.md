# 小游戏站模板（MiniPlay）

零依赖静态站生成器（只需 Node 18+，无 npm install），输出纯静态 HTML，可以直接部署到 Cloudflare Pages / Vercel / Netlify / GitHub Pages。每个页面都是完整的服务端 HTML，SEO 友好。

## 快速开始
```bash
npm run build     # 生成 dist/
npm run preview   # 本地预览 http://localhost:4173
```

## 目录结构
```
site.config.json        站点名、域名(siteUrl)、GA ID、可选的 Google Ad Manager
src/games.json          游戏数据（核心，加游戏只改这里）
src/categories.json     分类 slug 列表（名称/简介在 locales/en.json）
locales/en.json         界面文案 + 分类名（站点只有英文）
src/style.css           样式
public/games/<slug>/    自托管的游戏（自带 2 个原创游戏：snake、2048）
public/thumbs/          缩略图（建议 320x180，webp/png/svg）
build.mjs               生成器：首页/分类页/游戏页/404/sitemap.xml/robots.txt/_redirects
```

## 添加游戏
1. 自托管游戏：把游戏的 HTML5 构建产物放进 `public/games/<slug>/`（入口 index.html）。
   第三方嵌入：`embed` 直接填 iframe 地址（如 GameDistribution / GamePix 等平台提供的嵌入链接，需遵守其授权条款）。
2. 缩略图放 `public/thumbs/<slug>.png`。
3. 在 `src/games.json` 里加一条：
```json
{
  "slug": "my-game", "title": "My Game", "category": "action",
  "tags": ["runner"], "embed": "/games/my-game/index.html",
  "thumb": "/thumbs/my-game.png", "orientation": "landscape",
  "short": "一句话描述（用作 meta description，约 150 字符）",
  "description": "长描述（About 段落，建议 150-300 词英文，SEO 关键）",
  "controls": ["Arrow keys: move"],
  "faq": [{"q": "Is it free?", "a": "Yes."}],
  "released": "2026-10-13"
}
```
`orientation`: `landscape`(16:9) 或 `square`(4:3)。
4. `npm run build`，sitemap 会自动更新。

## 语言
站点只提供英文：页面在 `/`（例如 `/game/snake/`），不生成 `/zh/`，页头没有语言切换器。`sitemap.xml` 只含英文 URL。

以前上线过的中文地址会 **301** 到对应英文页。构建时写入 `dist/_redirects`（Cloudflare Pages 和 Netlify 会读取；本仓库同时生成的 `_headers` 也是给 Cloudflare Pages 用的）。仓库根目录的 `vercel.json` 给 Vercel 用，规则相同。例如 `/zh/` → `/`，`/zh/game/snake/` → `/game/snake/`。未单独列出的 `/zh/...` 由通配规则转到去掉 `/zh` 前缀后的路径。GitHub Pages 不能做这种服务端 301。

生成器仍按 `site.config.json` 的 `locales` 输出。以后若要加语言：复制 `locales/en.json`，把语言代码加进 `locales`，需要时在 `games.json` 的 `i18n` 里覆盖文案，然后重新构建。只有一种语言时不显示切换器；多种语言时每个页面带 `hreflang`（含 `x-default`）。游戏 iframe 地址会带上 `?lang=xx`。

## 游戏页包含
- 面包屑 + H1 标题 + 封面「Play Now」按钮（点击后才加载 iframe，提升首屏速度/LCP）
- 全屏按钮（Fullscreen API）
- About / How to Play / 标签 / FAQ（折叠）
- 侧栏相似游戏（同分类优先）+ 广告位
- JSON-LD：VideoGame、BreadcrumbList、FAQPage；首页 WebSite；分类页 CollectionPage+ItemList
- title / description / canonical / Open Graph / Twitter Card

## 广告（Google Ad Manager）
站点**不包含 Google AdSense**：没有 `adsbygoogle` 脚本、广告位、广告容器、发布商 ID，也没有占位虚线框。未启用广告时页面不留广告空白。Google Analytics（`gaId`，通过 `gtag.js`）照常输出。

只有把 `gam.enabled` 设为 `true` 时才会输出广告。广告位名称：`top`（首页/分类页顶部）、`belowGame`（游戏下方）、`sidebar`（游戏页侧栏）。`ads.txt` 只在 GAM 已启用且填了 `publisherId` 时生成。

### Google Ad Manager（A4 = GAM + GPT 标签）
「A4」指的就是 Google Ad Manager（GAM），页面上用 Google Publisher Tag（GPT，`gpt.js` / `googletag`）来请求广告。
```json
"gam": { "enabled": true, "networkCode": "12345678", "publisherId": "pub-xxxxxxxx",
  "adUnitPrefix": "/12345678/miniplay",
  "slots": {
    "top":       { "unit": "top_leaderboard", "sizes": [[728,90],[320,50]] },
    "sidebar":   { "unit": "sidebar_rect",    "sizes": [[300,250],[300,600]] },
    "belowGame": { "unit": "below_game",      "sizes": [[728,90],[300,250],[320,100]] } } }
```
1. GAM 后台 → 管理员 → 全局设置，可以看到**网络代码**（Network code），填进 `networkCode`，同时 `adUnitPrefix` 写成 `/网络代码/上级广告单元`。
2. 库存 → 广告单元 → 新建：代码分别为 `top_leaderboard`、`sidebar_rect`、`below_game`（放在上级单元 `miniplay` 下面），尺寸要和 `sizes` 一致。最终路径就是 `adUnitPrefix + "/" + unit`，例如 `/12345678/miniplay/top_leaderboard`。
3. 在 GAM 里建订单/订单项（或连接 AdSense/AdX 动态分配）后才会填充广告。
4. `publisherId` 填 GAM 关联的发布商 ID，会写入 `ads.txt`；如果代理商或 MCM 给了其他 ads.txt 行，手动追加到构建脚本里。
5. 生成的代码：`<head>` 里加载 gpt.js，并对当前页面用到的广告位执行 `defineSlot`，然后 `enableSingleRequest` + `collapseEmptyDivs` + `enableServices`；页面里每个位置是 `<div id="gpt-top">` 加 `googletag.display()`。`gam.enabled` 为 false 时这些标签都不会出现。

测试其他配置：`SITE_CONFIG=my.config.json node build.mjs`。

## 部署到 Cloudflare Pages
- 方式一（Git）：推到 GitHub → Cloudflare Pages 新建项目 → Build command `npm run build`，Output directory `dist`，环境变量 `NODE_VERSION=20`。
- 方式二（命令行）：`npm run build && npx wrangler pages deploy dist --project-name=miniplay`
- 部署后把 `site.config.json` 的 `siteUrl` 改成真实域名重新构建，并到 Google Search Console 提交 `/sitemap.xml`。

## SEO 建议（来自竞品调研，详见 research.md）
- 每个游戏页至少 300 词原创内容：玩法、操作、技巧、FAQ
- URL 稳定简短：`/game/<slug>/`，分类 `/category/<slug>/`
- 优先做长尾词："<游戏名> unblocked"、"<游戏名> online"、"X games" 分类页
- 内链：相关游戏、分类、标签

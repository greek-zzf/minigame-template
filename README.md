# 小游戏站模板（MiniPlay）

零依赖静态站生成器（只需 Node 18+，无 npm install），输出纯静态 HTML，可以直接部署到 Cloudflare Pages / Vercel / Netlify / GitHub Pages。每个页面都是完整的服务端 HTML，SEO 友好。

## 快速开始
```bash
npm run build     # 生成 dist/
npm run preview   # 本地预览 http://localhost:4173
```

## 目录结构
```
site.config.json        站点名、域名(siteUrl)、AdSense ID、GA ID
src/games.json          游戏数据（核心，加游戏只改这里）
src/categories.json     分类 slug 列表（名称/简介在 locales/*.json 里翻译）
locales/<lang>.json     界面文案 + 分类名翻译（en、zh）
src/style.css           样式
public/games/<slug>/    自托管的游戏（自带 2 个原创游戏：snake、2048）
public/thumbs/          缩略图（建议 320x180，webp/png/svg）
build.mjs               生成器：首页/分类页/游戏页/404/sitemap.xml/robots.txt/ads.txt
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

## 多语言（i18n）
- URL：默认语言（`defaultLocale`，默认 en）放在 `/`，其他语言放在 `/zh/`、`/ja/`……（例如 `/zh/game/snake/`）。
- 每个页面 `<head>` 里都有 `hreflang` 互指（包括 `x-default`），页头有语言切换器，会跳到当前页面的对应语言版本。
- `sitemap.xml` 包含所有语言的 URL，每条带 `xhtml:link` hreflang 互链。
- **新增语言（例如日语）**：
  1. 复制 `locales/en.json` 为 `locales/ja.json`，翻译全部字段（`htmlLang` 填 `ja`，`ogLocale` 填 `ja_JP`，`categories` 里翻译分类名）。
  2. `site.config.json` 的 `"locales"` 加上 `"ja"`。
  3. （可选）在 `games.json` 每个游戏的 `i18n` 里加 `"ja": {title, short, description, controls, faq}`。没翻译的字段会自动回退到默认语言。
  4. `npm run build`。
- 游戏 iframe 地址会自动带上 `?lang=xx`，自托管游戏可以读取这个参数，自己做游戏内文案的本地化（内置的两个示例游戏的游戏内文字目前只有英文）。

## 游戏页包含
- 面包屑 + H1 标题 + 封面「Play Now」按钮（点击后才加载 iframe，提升首屏速度/LCP）
- 全屏按钮（Fullscreen API）
- About / How to Play / 标签 / FAQ（折叠）
- 侧栏相似游戏（同分类优先）+ 广告位
- JSON-LD：VideoGame、BreadcrumbList、FAQPage；首页 WebSite；分类页 CollectionPage+ItemList
- title / description / canonical / Open Graph / Twitter Card

## 广告（AdSense / Google Ad Manager）
在 `site.config.json` 里配置。**优先级：`gam.enabled=true` → 用 GPT（googletag）；否则 `adsense.enabled=true` → 用 AdSense（adsbygoogle）；两者都关闭 → 显示虚线占位框**（开发时方便看位置）。
广告位名称：`top`（首页/分类页顶部）、`belowGame`（游戏下方）、`sidebar`（游戏页侧栏）。

### Google AdSense
```json
"adsense": { "enabled": true, "clientId": "ca-pub-你的发布商ID",
  "slots": { "top": "1234567890", "sidebar": "2345678901", "belowGame": "3456789012" } }
```
1. AdSense 后台 → 账号 → 账号信息，可以看到发布商 ID `pub-xxxxxxxx`，`clientId` 填 `ca-pub-xxxxxxxx`。
2. 广告 → 按广告单元 → 新建「展示广告」（自适应），复制代码里的 `data-ad-slot` 数字，分别填进 `slots`。
3. 构建后会自动生成 `ads.txt`（`google.com, pub-xxx, DIRECT, f08c47fec0942fa0`），要部署在根域名下。
4. 网站要先在 AdSense 里添加并通过审核才会出广告。游戏内的插屏/激励广告可另外申请 H5 Games Ads（AdSense for Games）。

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
4. `publisherId` 填 GAM 关联的 AdX/AdSense 发布商 ID，会写入 `ads.txt`；如果代理商或 MCM 给了其他 ads.txt 行，手动追加到构建脚本里。
5. 生成的代码：`<head>` 里加载 gpt.js，并对当前页面用到的广告位执行 `defineSlot`，然后 `enableSingleRequest` + `collapseEmptyDivs` + `enableServices`；页面里每个位置是 `<div id="gpt-top">` 加 `googletag.display()`。
6. 如果 AdSense 和 GAM 同时开启，只输出 GAM 代码，但两个发布商 ID 都会写进 ads.txt。

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

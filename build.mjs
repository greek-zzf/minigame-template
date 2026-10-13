// 零依赖静态站生成器：node build.mjs -> dist/
// 可用 SITE_CONFIG=xxx.json node build.mjs 指定其它配置文件
import fs from 'node:fs'; import path from 'node:path';
const R = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const cfg = R(process.env.SITE_CONFIG || 'site.config.json');
const games = R('src/games.json'), catSlugs = R('src/categories.json');
const DEF = cfg.defaultLocale || 'en', LOCALES = cfg.locales || [DEF];
const L = Object.fromEntries(LOCALES.map(l => [l, R(`locales/${l}.json`)]));
const OUT = 'dist', U = cfg.siteUrl.replace(/\/$/, '');
if (/example\.|localhost/.test(U)) console.warn(`⚠️  site.config.json siteUrl 仍是占位 (${U})：canonical/hreflang/sitemap 都会指向错误域名，上线前务必改成真实域名！`);
// meta description 补齐：短文案 + 本语言的通用后缀（避免过短/只有一句话）
const md = (s, l) => { s = String(s || '').trim(); const sx = L[l].metaSuffix || ''; return sx && s.length < (L[l].htmlLang.startsWith('zh') ? 50 : 80) ? (L[l].htmlLang.startsWith('zh') ? s + sx : `${s} ${sx}`) : s; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = (s, v) => String(s).replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');
const pre = l => l === DEF ? '' : `/${l}`;                 // 默认语言在 /，其他在 /zh/ ...
const loc = (l, p) => pre(l) + p;
const tg = (g, l) => ({...g, ...(g.i18n?.[l] || {})});       // 游戏字段按语言覆盖，缺失回退默认语言
const cat = (s, l) => ({slug: s, ...(L[l].categories?.[s] || L[DEF].categories?.[s] || {name: s, short: s, intro: ''})});

fs.rmSync(OUT, {recursive: true, force: true}); fs.cpSync('public', OUT, {recursive: true});
fs.copyFileSync('src/style.css', `${OUT}/style.css`);
const write = (p, html) => { const f = path.join(OUT, p); fs.mkdirSync(path.dirname(f), {recursive: true}); fs.writeFileSync(f, html); };

// ---------- 广告：GAM(GPT) 优先，其次 AdSense，否则占位 ----------
const GAM = cfg.gam?.enabled ? cfg.gam : null;
const ADS = !GAM && cfg.adsense?.enabled ? cfg.adsense : null;
const adMode = GAM ? 'gam' : ADS ? 'adsense' : 'placeholder';
function adHead(slotsUsed) {
  if (GAM) {
    const defs = slotsUsed.filter(s => GAM.slots[s]).map(s =>
      `googletag.defineSlot(${JSON.stringify(`${GAM.adUnitPrefix.replace(/\/$/, '')}/${GAM.slots[s].unit}`)},${JSON.stringify(GAM.slots[s].sizes)},'gpt-${s}').addService(googletag.pubads());`).join('');
    return `<script async src="https://securepubads.g.doubleclick.net/tag/js/gpt.js" crossorigin="anonymous"></script>
<script>window.googletag=window.googletag||{cmd:[]};googletag.cmd.push(function(){${defs}googletag.pubads().enableSingleRequest();googletag.pubads().collapseEmptyDivs();googletag.enableServices();});</script>`;
  }
  if (ADS) return `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADS.clientId}" crossorigin="anonymous"></script>`;
  return '';
}
function ad(slot, cls, t) {
  if (GAM && GAM.slots[slot]) {
    const minH = Math.min(...GAM.slots[slot].sizes.map(s => s[1]));
    return `<div class="adwrap ${cls}"><small>${esc(t.adLabel)}</small><div id="gpt-${slot}" style="min-height:${minH}px"><script>googletag.cmd.push(function(){googletag.display('gpt-${slot}')})</script></div></div>`;
  }
  if (ADS && ADS.slots[slot])
    return `<div class="adwrap ${cls}"><small>${esc(t.adLabel)}</small><ins class="adsbygoogle" style="display:block" data-ad-client="${ADS.clientId}" data-ad-slot="${ADS.slots[slot]}" data-ad-format="auto" data-full-width-responsive="true"></ins><script>(adsbygoogle=window.adsbygoogle||[]).push({})</script></div>`;
  return `<div class="ad ${cls}" data-slot="${slot}">Ad slot: ${slot}</div>`;
}

const card = (g, l) => { g = tg(g, l); return `<a class="card" href="${loc(l, `/game/${g.slug}/`)}"><img src="${g.thumb}" alt="${esc(g.title)}" loading="lazy" width="320" height="180"><span>${esc(g.title)}</span></a>`; };

function page({l, title, desc, p, body, ld = [], image, slots = [], noindex = false}) {
  const t = L[l], url = U + loc(l, p), img = U + (image || '/favicon.svg');
  const alts = LOCALES.map(x => `<link rel="alternate" hreflang="${L[x].htmlLang}" href="${U}${loc(x, p)}">`).join('')
    + `<link rel="alternate" hreflang="x-default" href="${U}${loc(DEF, p)}">`;
  const sw = LOCALES.length > 1 ? `<div class="lang" aria-label="${esc(t.language)}">${LOCALES.map(x =>
    x === l ? `<b>${esc(L[x].langName)}</b>` : `<a hreflang="${L[x].htmlLang}" lang="${L[x].htmlLang}" href="${loc(x, p)}">${esc(L[x].langName)}</a>`).join(' · ')}</div>` : '';
  return `<!doctype html><html lang="${t.htmlLang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">
${noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${url}">${alts}`}<link rel="icon" href="/favicon.svg">
<meta property="og:type" content="website"><meta property="og:locale" content="${t.ogLocale}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${url}"><meta property="og:image" content="${img}"><meta name="twitter:card" content="summary_large_image">
<link rel="stylesheet" href="/style.css">
${adHead(slots)}
${cfg.gaId ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${cfg.gaId}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${cfg.gaId}')</script>` : ''}
${ld.map(o => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join('\n')}
</head><body data-ads="${adMode}"><header><div class="wrap"><a class="logo" href="${loc(l, '/')}">🎮 ${esc(cfg.siteName)}</a><nav>${catSlugs.map(s => `<a href="${loc(l, `/category/${s}/`)}">${esc(cat(s, l).short)}</a>`).join('')}</nav>${sw}</div></header>
<main class="wrap">${body}</main>
<footer><div class="wrap">© ${new Date().getFullYear()} ${esc(cfg.siteName)} · <a href="${loc(l, '/about/')}">${esc(t.aboutPage)}</a> · <a href="${loc(l, '/privacy/')}">${esc(t.privacyPage)}</a> · ${esc(t.footer)}</div></footer></body></html>`;
}

const paths = [];
for (const l of LOCALES) {
  const t = L[l], v = {site: cfg.siteName};
  const add = (p, html) => { write(loc(l, p).replace(/^\//, '') + (p.endsWith('/') ? 'index.html' : ''), html); };
  // 首页
  add('/', page({l, p: '/', title: `${cfg.siteName} – ${t.tagline}`, desc: t.description, slots: ['top'],
    ld: [{'@context':'https://schema.org','@type':'WebSite',name:cfg.siteName,url:U+loc(l,'/'),inLanguage:t.htmlLang}],
    body: `${ad('top','ad-top',t)}<h1>${esc(t.tagline)}</h1><div class="grid">${games.map(g => card(g, l)).join('')}</div>
    ${catSlugs.map(s => { const c = cat(s, l), li = games.filter(g => g.category === s); return li.length ? `<h2><a href="${loc(l, `/category/${s}/`)}">${esc(c.name)} »</a></h2><div class="grid">${li.map(g => card(g, l)).join('')}</div>` : ''; }).join('')}
    <div class="box"><h2>${esc(fmt(t.playFreeOn, v))}</h2><p>${esc(t.description)}</p></div>`}));
  // 分类页
  for (const s of catSlugs) {
    const c = cat(s, l), li = games.filter(g => g.category === s), p = `/category/${s}/`;
    add(p, page({l, p, title: fmt(t.catTitle, {...v, name: c.name}), desc: md(c.intro, l), slots: ['top'],
      ld: [{'@context':'https://schema.org','@type':'CollectionPage',name:c.name,url:U+loc(l,p),inLanguage:t.htmlLang,
        mainEntity:{'@type':'ItemList',itemListElement:li.map((g,i)=>({'@type':'ListItem',position:i+1,url:U+loc(l,`/game/${g.slug}/`),name:tg(g,l).title}))}}],
      body: `<div class="crumb"><a href="${loc(l,'/')}">${esc(t.home)}</a> › ${esc(c.name)}</div><h1>${esc(c.name)}</h1><p>${esc(c.intro)}</p>${ad('top','ad-top',t)}
      <div class="grid">${li.map(g => card(g, l)).join('') || `<p>${esc(t.comingSoon)}</p>`}</div>`}));
  }
  // 游戏页
  for (const g0 of games) {
    const g = tg(g0, l), c = cat(g.category, l), p = `/game/${g.slug}/`;
    const rel = games.filter(x => x.slug !== g.slug).sort((a,b) => (b.category===g.category) - (a.category===g.category)).slice(0, 12);
    const tv = {...v, title: g.title};
    const ld = [
      {'@context':'https://schema.org','@type':'VideoGame',name:g.title,description:g.short,url:U+loc(l,p),image:U+g.thumb,genre:c.name,inLanguage:t.htmlLang,
        gamePlatform:['Web browser','PC','Mobile'],applicationCategory:'Game',operatingSystem:'Any',datePublished:g.released,
        offers:{'@type':'Offer',price:'0',priceCurrency:'USD'},publisher:{'@type':'Organization',name:cfg.siteName}},
      {'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[
        {'@type':'ListItem',position:1,name:t.home,item:U+loc(l,'/')},{'@type':'ListItem',position:2,name:c.name,item:U+loc(l,`/category/${c.slug}/`)},{'@type':'ListItem',position:3,name:g.title,item:U+loc(l,p)}]},
    ];
    if (g.faq?.length) ld.push({'@context':'https://schema.org','@type':'FAQPage',mainEntity:g.faq.map(f=>({'@type':'Question',name:f.q,acceptedAnswer:{'@type':'Answer',text:f.a}}))});
    add(p, page({l, p, title: fmt(t.gameTitle, tv), desc: md(g.short, l), ld, image: g.thumb, slots: ['belowGame','sidebar'], body: `
<div class="crumb"><a href="${loc(l,'/')}">${esc(t.home)}</a> › <a href="${loc(l,`/category/${c.slug}/`)}">${esc(c.name)}</a> › ${esc(g.title)}</div>
<div class="layout"><div>
 <div class="player" id="player"><div class="frame ${g.orientation==='square'?'square':''}" id="frame">
  <div class="cover" id="cover"><img src="${g.thumb}" alt="${esc(g.title)}" width="160" height="90" fetchpriority="high"><button class="play">${esc(t.playNow)}</button></div></div>
  <div class="bar"><h1 style="margin:0;font-size:18px">${esc(g.title)}</h1><button id="fs">${esc(t.fullscreen)}</button></div></div>
 ${ad('belowGame','ad-in',t)}
 <section class="box"><h2>${esc(fmt(t.about, tv))}</h2><p>${esc(g.description)}</p>
  <h2>${esc(fmt(t.howToPlay, tv))}</h2><ul>${g.controls.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>
  <div class="tags">${g.tags.map(x=>`<a href="${loc(l,`/category/${c.slug}/`)}">#${esc(x)}</a>`).join('')}</div></section>
 ${g.faq?.length ? `<section class="box"><h2>${esc(t.faq)}</h2>${g.faq.map(f=>`<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}</section>` : ''}
</div><aside class="side">${ad('sidebar','ad-side',t)}<h2>${esc(t.similar)}</h2><div class="grid">${rel.map(x => card(x, l)).join('')}</div></aside></div>
<script>
const cover=document.getElementById('cover'),frame=document.getElementById('frame');
cover.onclick=()=>{const f=document.createElement('iframe');f.src=${JSON.stringify(g.embed + (g.embed.includes('?') ? '&' : '?') + 'lang=' + l)};f.allow='fullscreen; autoplay; gamepad';f.title=${JSON.stringify(g.title)};frame.appendChild(f);cover.remove();setTimeout(()=>f.focus(),100)};
document.getElementById('fs').onclick=()=>{const p=document.getElementById('player');if(document.fullscreenElement)document.exitFullscreen();else (p.requestFullscreen||p.webkitRequestFullscreen).call(p)};
</script>`}));
  }
  for (const [slug, k, txt] of [['about','aboutPage','aboutText'],['privacy','privacyPage','privacyText']])
    add(`/${slug}/`, page({l, p: `/${slug}/`, title: `${t[k]} | ${cfg.siteName}`, desc: md(fmt(t[txt], v), l), body: `<h1>${esc(t[k])}</h1><p>${esc(fmt(t[txt], v))}</p>`}));
  if (l !== DEF) write(`${l}/404.html`, page({l, p: '/404', title: `404 | ${cfg.siteName}`, desc: t.notFound, noindex: true, body: `<h1>404</h1><p>${esc(t.notFound)} <a href="${loc(l,'/')}">${esc(t.backHome)}</a></p>`}));
}
const t0 = L[DEF];
write('404.html', page({l: DEF, p: '/404', title: `404 | ${cfg.siteName}`, desc: t0.notFound, noindex: true, body: `<h1>404</h1><p>${esc(t0.notFound)} <a href="/">${esc(t0.backHome)}</a></p><div class="grid">${games.map(g => card(g, DEF)).join('')}</div>`}));

// sitemap：每个 URL 带 xhtml:link hreflang 互指（Google 推荐做法）
const today = new Date().toISOString().slice(0, 10);
const gmod = g => g.updated || g.released || today, latest = games.map(gmod).sort().pop() || today;
const lastmod = p => { const g = games.find(x => p === `/game/${x.slug}/`); return g ? gmod(g) : latest; };
const base = ['/', ...catSlugs.map(s => `/category/${s}/`), ...games.map(g => `/game/${g.slug}/`), '/about/', '/privacy/'];
const entries = LOCALES.flatMap(l => base.map(p => `<url><loc>${U}${loc(l, p)}</loc><lastmod>${lastmod(p)}</lastmod>${
  LOCALES.map(x => `<xhtml:link rel="alternate" hreflang="${L[x].htmlLang}" href="${U}${loc(x, p)}"/>`).join('')}<xhtml:link rel="alternate" hreflang="x-default" href="${U}${p}"/></url>`));
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${entries.join('\n')}\n</urlset>\n`);
write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${U}/sitemap.xml\n`);
// ads.txt：AdSense 与 GAM 的发布商 ID 都写入（去重）
const pubs = new Set();
if (cfg.adsense?.enabled && cfg.adsense.clientId) pubs.add(cfg.adsense.clientId.replace(/^ca-/, ''));
if (cfg.gam?.enabled && cfg.gam.publisherId) pubs.add(cfg.gam.publisherId.replace(/^ca-/, ''));
if (pubs.size) write('ads.txt', [...pubs].map(p => `google.com, ${p}, DIRECT, f08c47fec0942fa0`).join('\n') + '\n');
// 游戏 iframe 原始页（/games/*）是薄内容重复页：加 noindex（meta + X-Robots-Tag），不要用 robots.txt 屏蔽，否则 Google 看不到 noindex
for (const d of fs.readdirSync(`${OUT}/games`)) { const f = `${OUT}/games/${d}/index.html`; if (fs.existsSync(f)) { const h = fs.readFileSync(f, 'utf8'); if (!/name="robots"/.test(h)) fs.writeFileSync(f, h.replace(/<meta charset[^>]*>/i.test(h) ? /(<meta charset[^>]*>)/i : /(<head>)/i, '$1<meta name="robots" content="noindex">')); } }
write('_headers', `/games/*\n  Cache-Control: public, max-age=86400\n  X-Robots-Tag: noindex\n/*\n  X-Content-Type-Options: nosniff\n`);
console.log(`Built ${base.length} pages × ${LOCALES.length} locales (${LOCALES.join(',')}), ads=${adMode} -> ${OUT}/`);

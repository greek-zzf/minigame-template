// Static generator: node build.mjs -> dist/
// English-only DLE HQ hub. Ads are not rendered.
import fs from 'node:fs';
import path from 'node:path';

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const cfg = readJson(process.env.SITE_CONFIG || 'site.config.json');
const games = readJson('src/games.json');
const catSlugs = readJson('src/categories.json');
const guides = readJson('src/guides.json');
const DEF = cfg.defaultLocale || 'en';
const LOCALES = cfg.locales || [DEF];
const L = Object.fromEntries(LOCALES.map(code => [code, readJson(`locales/${code}.json`)]));
const OUT = 'dist';
const SITE = cfg.siteUrl.replace(/\/$/, '');
const FRESH_DAYS = cfg.freshDays ?? 5;
const BRAND = cfg.siteName;

const articles = {};
for (const game of games) {
  articles[game.slug] = (await import(`./src/articles/${game.slug}.mjs`)).default;
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync('public', OUT, { recursive: true });
fs.copyFileSync('src/style.css', `${OUT}/style.css`);

function pngSize(file) {
  const buf = fs.readFileSync(file);
  if (buf.toString('ascii', 12, 16) !== 'IHDR') throw new Error('not a png: ' + file);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function writeFaviconIco(outFile) {
  const sizes = [16, 32, 48];
  const images = sizes.map(size => {
    const file = `${OUT}/favicon-${size}x${size}.png`;
    const dim = pngSize(file);
    if (dim.width !== size || dim.height !== size) throw new Error(`favicon-${size}x${size}.png is ${dim.width}x${dim.height}`);
    return fs.readFileSync(file);
  });
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const entries = Buffer.alloc(16 * images.length);
  let offset = 6 + entries.length;
  images.forEach((data, index) => {
    const size = sizes[index];
    const at = index * 16;
    entries.writeUInt8(size, at);
    entries.writeUInt8(size, at + 1);
    entries.writeUInt16LE(1, at + 4);
    entries.writeUInt16LE(32, at + 6);
    entries.writeUInt32LE(data.length, at + 8);
    entries.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });
  fs.writeFileSync(outFile, Buffer.concat([header, entries, ...images]));
}

writeFaviconIco(`${OUT}/favicon.ico`);

function logoSvg() {
  return fs.readFileSync('src/brand/dlehq-logo-horizontal.svg', 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace('<svg ', '<svg class="logo-mark" width="200" height="60" aria-hidden="true" focusable="false" ')
    .replaceAll('font-family="-apple-system, sans-serif"', 'font-family="DLE HQ Lockup, system-ui, -apple-system, \'Segoe UI\', sans-serif"')
    .trim();
}

const write = (rel, html) => {
  if (/[\u4e00-\u9fff]/.test(html)) throw new Error('Chinese text in ' + rel);
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
};

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[ch]));
const json = value => JSON.stringify(value).replace(/</g, '\\u003c');
const inline = value => esc(value).replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text, href) => `<a href="${href}">${text}</a>`);
// Public URLs have no trailing slash except the homepage (`/` , or `/zh/` for a non-default locale).
const bare = urlPath => {
  const raw = String(urlPath || '/');
  const hashAt = raw.indexOf('#');
  const before = hashAt >= 0 ? raw.slice(0, hashAt) : raw;
  const suffix = hashAt >= 0 ? raw.slice(hashAt) : '';
  if (before === '/' || before === '') return '/' + suffix;
  return '/' + before.replace(/^\/+|\/+$/g, '') + suffix;
};
const loc = (code, urlPath) => {
  const path = bare(urlPath);
  const hashAt = path.indexOf('#');
  const pathname = hashAt >= 0 ? path.slice(0, hashAt) : path;
  const suffix = hashAt >= 0 ? path.slice(hashAt) : '';
  if (pathname === '/') return (code === DEF ? '/' : `/${code}/`) + suffix;
  return (code === DEF ? '' : `/${code}`) + pathname + suffix;
};
// Cloudflare Pages redirects /x/index.html to /x/ (trailing slash). A file at dist/x.html is served at /x,
// and both /x.html and /x/ 308 once to /x. Do not also emit dist/x/index.html or /x/ stays a 200.
const gameText = (game, code) => ({ ...game, ...(game.i18n?.[code] || {}) });
const cat = (slug, code) => ({ slug, ...(L[code].categories?.[slug] || L[DEF].categories?.[slug] || { name: slug, short: slug, intro: '' }) });
const addedOf = game => game.added || game.released;
const gamesIn = slug => games.filter(game => game.category === slug);
const indexableCats = () => catSlugs.filter(slug => gamesIn(slug).length >= 2);

function addDays(iso, days) {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
const TODAY = new Date().toISOString().slice(0, 10);
function freshUntil(game) {
  const min = addDays(addedOf(game), FRESH_DAYS);
  return game.freshUntil && game.freshUntil > min ? game.freshUntil : min;
}
const isFresh = game => TODAY <= freshUntil(game);

function wordCount(html) {
  const text = String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#39;|&apos;|&#x27;/gi, "'")
    .replace(/&(?:amp|lt|gt|quot);/g, ' ')
    .replace(/[’']/g, '')
    .replace(/[^A-Za-z0-9-]+/g, ' ')
    .trim();
  return text ? text.split(/\s+/).filter(Boolean).length : 0;
}

function blocks(list) {
  return (list || []).map(block => {
    if (block.h3) return `<h3>${inline(block.h3)}</h3>`;
    if (block.p) return block.p.map(paragraph => `<p>${inline(paragraph)}</p>`).join('');
    if (block.ul) return `<ul>${block.ul.map(item => `<li>${inline(item)}</li>`).join('')}</ul>`;
    return '';
  }).join('\n');
}

function headingsOf(article) {
  const heads = [article.howToTitle, article.rulesTitle, article.tipsTitle];
  for (const key of ['howTo', 'rules', 'tips']) {
    for (const block of article[key] || []) if (block.h3) heads.push(block.h3);
  }
  return heads.join(' ').toLowerCase();
}

function card(game, code) {
  const view = gameText(game, code);
  const phrase = view.linkPhrase || `Play ${view.title}`;
  return `<a class="card" href="${loc(code, `/game/${view.slug}/`)}"><img src="${view.thumb}" alt="" width="320" height="180" loading="lazy"><span>${esc(phrase)}</span></a>`;
}

function crumbs(items) {
  return `<nav class="crumb" aria-label="Breadcrumb"><ol>${items.map(item => `<li>${item.href ? `<a href="${esc(item.href)}">${esc(item.name)}</a>` : `<span aria-current="page">${esc(item.name)}</span>`}</li>`).join('')}</ol></nav>`;
}

function breadcrumbLd(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: SITE + item.path,
    })),
  };
}

function sortRelated(current, list) {
  return list.slice().sort((a, b) => {
    const aCat = a.category === current.category ? 0 : 1;
    const bCat = b.category === current.category ? 0 : 1;
    if (aCat !== bCat) return aCat - bCat;
    const byDate = addedOf(a).localeCompare(addedOf(b));
    return byDate || a.title.localeCompare(b.title);
  });
}

function shell({ code, title, desc, urlPath, body, ld = [], image, imageWidth, imageHeight, noindex = false }) {
  const dict = L[code];
  const url = SITE + loc(code, urlPath);
  const img = SITE + (image || '/og.png');
  const imgWidth = imageWidth || (image ? '' : 1200);
  const imgHeight = imageHeight || (image ? '' : 630);
  const alternates = LOCALES.map(item => `<link rel="alternate" hreflang="${L[item].htmlLang}" href="${SITE}${loc(item, urlPath)}">`).join('')
    + `<link rel="alternate" hreflang="x-default" href="${SITE}${loc(DEF, urlPath)}">`;
  const footerCats = catSlugs.map(slug => {
    const info = cat(slug, code);
    return `<a href="${loc(code, `/category/${slug}/`)}">${esc(info.name)} DLE games</a>`;
  }).join('');
  const footerGames = games.map(game => {
    const view = gameText(game, code);
    return `<a href="${loc(code, `/game/${view.slug}/`)}">${esc(view.linkPhrase || `Play ${view.title}`)}</a>`;
  }).join('');
  const analytics = cfg.gaId
    ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${cfg.gaId}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${cfg.gaId}')</script>`
    : '';
  return `<!doctype html><html lang="${dict.htmlLang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">${noindex ? '<meta name="robots" content="noindex, follow">' : alternates}<link rel="icon" href="/favicon.ico" sizes="any"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="icon" type="image/png" sizes="48x48" href="/favicon-48x48.png"><link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png"><link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png"><link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png"><link rel="manifest" href="/site.webmanifest">
<meta property="og:type" content="website"><meta property="og:locale" content="${dict.ogLocale}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${url}"><meta property="og:image" content="${img}">${imgWidth ? `<meta property="og:image:width" content="${imgWidth}"><meta property="og:image:height" content="${imgHeight}">` : ''}<meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${img}">
<link rel="stylesheet" href="/style.css">
${analytics}
${ld.map(entry => `<script type="application/ld+json">${json(entry)}</script>`).join('\n')}
</head><body>
<a class="skip" href="#content">Skip to content</a>
<header><div class="wrap"><a class="logo" href="${loc(code, '/')}" aria-label="DLE HQ">${logoSvg()}</a><nav aria-label="Primary"><a href="${loc(code, '/#categories')}">Categories</a><a href="${loc(code, '/#popular')}">Popular</a><a href="${loc(code, '/about/')}">${esc(dict.aboutPage)}</a></nav></div></header>
<main id="content" class="wrap">${body}</main>
<footer><div class="wrap foot">
<div><strong>${esc(BRAND)}</strong><p><a href="${loc(code, '/')}">Play free daily puzzle games on the DLE HQ homepage</a></p><p><a href="${loc(code, '/about/')}">${esc(dict.aboutPage)}</a> · <a href="${loc(code, '/privacy/')}">${esc(dict.privacyPage)}</a></p><p>© ${new Date().getFullYear()} ${esc(BRAND)}. ${esc(dict.footer)}</p></div>
<nav aria-label="Categories"><b>Categories</b>${footerCats}</nav>
<nav aria-label="Games"><b>Games</b>${footerGames}</nav>
</div></footer></body></html>`;
}

const counts = {};
for (const code of LOCALES) {
  const dict = L[code];
  const add = (urlPath, html) => {
    const pathname = loc(code, urlPath).replace(/#.*$/, '');
    const file = pathname.endsWith('/')
      ? (pathname === '/' ? 'index.html' : pathname.slice(1) + 'index.html')
      : pathname.slice(1) + '.html';
    write(file, html);
  };
  const featured = games.find(game => game.featured) || games[0];
  const featuredView = gameText(featured, code);
  const searchData = games.map(game => {
    const view = gameText(game, code);
    return {
      title: view.title,
      phrase: view.linkPhrase || `Play ${view.title}`,
      href: loc(code, `/game/${view.slug}/`),
      thumb: view.thumb,
      category: cat(view.category, code).name,
      tags: view.tags || [],
      short: view.short || '',
    };
  });
  const popular = games.filter(game => (game.popularity || 0) > 0).sort((a, b) => b.popularity - a.popularity || a.title.localeCompare(b.title));
  const fresh = games.filter(isFresh).sort((a, b) => addedOf(b).localeCompare(addedOf(a)));
  const guideHtml = guides.length
    ? `<section id="guides"><h2>${esc(dict.guides)}</h2><ul>${guides.map(guide => `<li><a href="${esc(guide.href)}">${esc(guide.title)}</a>${guide.summary ? ` — ${esc(guide.summary)}` : ''}</li>`).join('')}</ul></section>`
    : '';
  const homeFaqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: dict.homeFaq.map(item => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };
  add('/', shell({
    code,
    urlPath: '/',
    title: `${BRAND} – Daily Games Like Wordle: Play Free Unlimited Puzzle Games`,
    desc: dict.description,
    ld: [
      { '@context': 'https://schema.org', '@type': 'WebSite', name: BRAND, url: SITE + loc(code, '/'), inLanguage: dict.htmlLang },
      homeFaqLd,
    ],
    body: `<h1>${esc(dict.homeH1)}</h1>
<p class="lead">${esc(dict.homeLead)}</p>
<form class="search" role="search" action="#" onsubmit="return false">
<label for="q">${esc(dict.searchLabel)}</label>
<input id="q" name="q" type="search" placeholder="${esc(dict.searchPlaceholder)}" autocomplete="off">
</form>
<div id="hits" class="hits" hidden></div>
<section class="featured" id="featured">
<h2>${esc(dict.featured)}</h2>
<p>${esc(featuredView.title)} is embedded below so you can play it on this page. The longer guide is <a href="${loc(code, `/game/${featuredView.slug}/`)}">${esc(featuredView.linkPhrase)}</a>.</p>
<div class="player"><div class="frame ${esc(featuredView.orientation || 'board')}" style="background:${esc(featuredView.frameBg || '#000')}"><iframe src="${esc(featuredView.embed)}" title="${esc(featuredView.title)}" allow="fullscreen; autoplay; gamepad"></iframe></div></div>
</section>
<section id="categories"><h2>${esc(dict.browse)}</h2>
<div class="cats">${catSlugs.map(slug => {
    const info = cat(slug, code);
    const count = gamesIn(slug).length;
    return `<a class="catcard" href="${loc(code, `/category/${slug}/`)}"><b>${esc(info.name)}</b><span>${count} ${count === 1 ? 'game' : 'games'}</span><p>${esc(info.intro)}</p></a>`;
  }).join('')}</div></section>
<section id="popular"><h2>${esc(dict.popular)}</h2><div class="grid">${popular.map(game => card(game, code)).join('')}</div></section>
<section id="fresh"><h2>${esc(dict.fresh)}</h2><p>${esc(dict.freshNote)}</p><div class="grid">${fresh.map(game => card(game, code)).join('') || `<p>${esc(dict.freshEmpty)}</p>`}</div></section>
${guideHtml}
<section class="box" id="what"><h2>${esc(dict.whatTitle)}</h2>
${dict.whatParagraphs.map(paragraph => `<p>${esc(paragraph)}</p>`).join('')}
<h2>${esc(dict.faq)}</h2>
${dict.homeFaq.map(item => `<details><summary>${esc(item.q)}</summary><p>${esc(item.a)}</p></details>`).join('')}
</section>
<script>
const GAMES = ${json(searchData)};
const q = document.getElementById('q');
const hits = document.getElementById('hits');
function hay(game){ return (game.title + ' ' + game.phrase + ' ' + game.category + ' ' + game.tags.join(' ') + ' ' + game.short).toLowerCase(); }
q.addEventListener('input', () => {
  const query = q.value.trim().toLowerCase();
  hits.replaceChildren();
  if (!query) { hits.hidden = true; return; }
  hits.hidden = false;
  const matched = GAMES.filter(game => hay(game).includes(query));
  const heading = document.createElement('h2');
  heading.textContent = ${JSON.stringify(dict.searchResults)};
  hits.append(heading);
  if (!matched.length) {
    const empty = document.createElement('p');
    empty.textContent = ${JSON.stringify(dict.searchEmpty)};
    hits.append(empty);
    return;
  }
  const grid = document.createElement('div');
  grid.className = 'grid';
  for (const game of matched) {
    const link = document.createElement('a');
    link.className = 'card';
    link.href = game.href;
    const img = document.createElement('img');
    img.src = game.thumb; img.alt = ''; img.width = 320; img.height = 180;
    const label = document.createElement('span');
    label.textContent = game.phrase;
    link.append(img, label);
    grid.append(link);
  }
  hits.append(grid);
});
</script>`,
  }));

  for (const slug of catSlugs) {
    const info = cat(slug, code);
    const list = gamesIn(slug);
    const urlPath = `/category/${slug}/`;
    const thin = list.length < 2;
    const trail = [
      { name: dict.home, href: loc(code, '/'), path: loc(code, '/') },
      { name: info.name, path: loc(code, urlPath) },
    ];
    add(urlPath, shell({
      code,
      urlPath,
      noindex: thin,
      title: `${info.name} DLE Games – Play Free Daily ${info.name} Puzzles | ${BRAND}`,
      desc: info.intro,
      ld: [
        breadcrumbLd(trail),
        {
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: `${info.name} DLE Games`,
          url: SITE + loc(code, urlPath),
          inLanguage: dict.htmlLang,
          mainEntity: {
            '@type': 'ItemList',
            itemListElement: list.map((game, index) => ({
              '@type': 'ListItem',
              position: index + 1,
              url: SITE + loc(code, `/game/${game.slug}/`),
              name: gameText(game, code).title,
            })),
          },
        },
      ],
      body: `${crumbs(trail.map((item, index) => ({ name: item.name, href: index < trail.length - 1 ? item.href : '' })))}
<h1>${esc(info.name)} DLE Games</h1>
<p>${esc(info.intro)}</p>
<p class="home-link"><a href="${loc(code, '/')}">More daily puzzles beyond ${esc(info.name)} are on the DLE HQ homepage</a></p>
<div class="grid">${list.map(game => card(game, code)).join('') || `<p>${esc(dict.emptyCategory)}</p>`}</div>`,
    }));
  }

  for (const source of games) {
    const view = gameText(source, code);
    const info = cat(view.category, code);
    const article = articles[view.slug];
    const urlPath = `/game/${view.slug}/`;
    const heads = headingsOf(article);
    for (const phrase of ['free', 'unlimited', 'online', 'no download']) {
      if (!heads.includes(phrase)) throw new Error(`${view.slug} heading missing “${phrase}”`);
    }
    if (!heads.includes(String(view.keyword || '').toLowerCase())) throw new Error(`${view.slug} heading missing keyword ${view.keyword}`);
    const how = `<section class="prose"><h2>${esc(article.howToTitle)}</h2>${blocks(article.howTo)}</section>`;
    const rules = `<section class="prose"><h2>${esc(article.rulesTitle)}</h2>${blocks(article.rules)}</section>`;
    const tips = `<section class="prose"><h2>${esc(article.tipsTitle)}</h2>${blocks(article.tips)}</section>`;
    const faq = `<section class="prose" id="faq"><h2>${esc(dict.faq)}</h2>${article.faq.map(item => `<details><summary>${esc(item.q)}</summary><p>${esc(item.a)}</p></details>`).join('')}</section>`;
    const editorial = how + rules + tips + faq;
    const count = wordCount(editorial);
    counts[view.slug] = count;
    if (count < 1000 || count > 2000) throw new Error(`${view.slug} body is ${count} words`);
    const others = games.filter(game => game.slug !== view.slug);
    const related = sortRelated(view, others).slice(0, 8);
    const newer = others.filter(game => addedOf(game) > addedOf(view)).sort((a, b) => addedOf(b).localeCompare(addedOf(a)));
    const trail = [
      { name: dict.home, href: loc(code, '/'), path: loc(code, '/') },
      { name: info.name, href: loc(code, `/category/${info.slug}/`), path: loc(code, `/category/${info.slug}/`) },
      { name: view.title, path: loc(code, urlPath) },
    ];
    const faqLd = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: article.faq.map(item => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: { '@type': 'Answer', text: item.a },
      })),
    };
    add(urlPath, shell({
      code,
      urlPath,
      title: `${view.title} – Play Free Online (Unlimited, No Download) | ${BRAND}`,
      desc: view.short,
      image: view.thumb,
      imageWidth: 320,
      imageHeight: 180,
      ld: [
        {
          '@context': 'https://schema.org',
          '@type': 'VideoGame',
          name: view.title,
          description: view.short,
          url: SITE + loc(code, urlPath),
          image: SITE + view.thumb,
          genre: info.name,
          inLanguage: dict.htmlLang,
          gamePlatform: ['Web browser'],
          applicationCategory: 'Game',
          operatingSystem: 'Any',
          datePublished: view.released || view.added,
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
          publisher: { '@type': 'Organization', name: BRAND },
        },
        breadcrumbLd(trail),
        faqLd,
      ],
      body: `${crumbs(trail.map((item, index) => ({ name: item.name, href: index < trail.length - 1 ? item.href : '' })))}
<h1>${esc(view.title)}</h1>
<div class="player" id="player"><div class="frame ${esc(view.orientation || 'board')}" id="frame" style="background:${esc(view.frameBg || '#000')}"><iframe src="${esc(view.embed)}" title="${esc(view.title)}" allow="fullscreen; autoplay; gamepad"></iframe></div>
<div class="bar"><button id="fs" type="button">${esc(dict.fullscreen)}</button></div></div>
${view.disclaimer ? `<p class="disclaimer">${esc(view.disclaimer)}</p>` : ''}
<p class="home-link"><a href="${loc(code, '/')}">Play other daily puzzles alongside ${esc(view.title)} on the DLE HQ homepage</a></p>
${editorial}
<p class="tags"><a href="${loc(code, `/category/${info.slug}/`)}">More ${esc(info.name)} DLE games</a></p>
${related.length ? `<section id="related"><h2>${esc(dict.related)}</h2><div class="grid">${related.map(game => card(game, code)).join('')}</div></section>` : ''}
${newer.length ? `<section id="fresh-games"><h2>${esc(dict.fresh)}</h2><p>${esc(dict.freshOlder)}</p><div class="grid">${newer.map(game => card(game, code)).join('')}</div></section>` : ''}
<script>
document.getElementById('fs').onclick=()=>{const p=document.getElementById('player'); if(document.fullscreenElement) document.exitFullscreen(); else (p.requestFullscreen||p.webkitRequestFullscreen).call(p)};
</script>`,
    }));
  }

  const paragraphs = (key) => (dict[key] || []).map(paragraph => `<p>${inline(paragraph)}</p>`).join('');
  add('/about/', shell({
    code,
    urlPath: '/about/',
    title: `About | ${BRAND}`,
    desc: dict.aboutParagraphs[0],
    body: `<h1>${esc(dict.aboutPage)}</h1>${paragraphs('aboutParagraphs')}<p class="home-link"><a href="${loc(code, '/')}">The daily games themselves start on the DLE HQ homepage</a></p><p><a href="${loc(code, '/category/music/')}">Music DLE games</a> · <a href="${loc(code, '/game/songless-unlimited/')}">Play Songless Unlimited, the free music guessing game</a> · <a href="${loc(code, '/game/heardle/')}">Play Hookstep, the daily intro puzzle</a> · <a href="${loc(code, '/game/wordle-unlimited/')}">Play Folio, the unlimited five-letter word game</a></p>`,
  }));
  add('/privacy/', shell({
    code,
    urlPath: '/privacy/',
    title: `Privacy | ${BRAND}`,
    desc: dict.privacyParagraphs[0],
    body: `<h1>${esc(dict.privacyPage)}</h1>${paragraphs('privacyParagraphs')}<p class="home-link"><a href="${loc(code, '/')}">Game pages linked from the DLE HQ homepage explain each puzzle</a></p>`,
  }));
}

write('404.html', shell({
  code: DEF,
  urlPath: '/404',
  title: `404 | ${BRAND}`,
  desc: L[DEF].notFound,
  noindex: true,
  body: `<h1>404</h1><p>${esc(L[DEF].notFound)} <a href="/">${esc(L[DEF].backHome)}</a></p><div class="grid">${games.map(game => card(game, DEF)).join('')}</div>`,
}));

const pagePaths = ['/', ...catSlugs.map(slug => `/category/${slug}`), ...games.map(game => `/game/${game.slug}`), '/about', '/privacy'];
const indexedPaths = ['/', ...indexableCats().map(slug => `/category/${slug}`), ...games.map(game => `/game/${game.slug}`), '/about', '/privacy'];
const lastmod = urlPath => {
  if (bare(urlPath) === '/') return games.map(addedOf).sort().at(-1) || TODAY;
  const game = games.find(item => bare(urlPath) === `/game/${item.slug}`);
  if (game) return addedOf(game);
  const match = bare(urlPath).match(/^\/category\/([^/]+)$/);
  if (match) {
    const list = gamesIn(match[1]).map(addedOf).sort();
    return list.at(-1) || TODAY;
  }
  return TODAY;
};
const entries = LOCALES.flatMap(code => indexedPaths.map(urlPath => `<url><loc>${SITE}${loc(code, urlPath)}</loc><lastmod>${lastmod(urlPath)}</lastmod>${
  LOCALES.map(item => `<xhtml:link rel="alternate" hreflang="${L[item].htmlLang}" href="${SITE}${loc(item, urlPath)}"/>`).join('')
}<xhtml:link rel="alternate" hreflang="x-default" href="${SITE}${loc(DEF, urlPath)}"/></url>`));
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${entries.join('\n')}\n</urlset>\n`);
write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);

const legacy = [
  ['/game/snake/', '/'],
  ['/game/snake', '/'],
  ['/game/2048/', '/'],
  ['/game/2048', '/'],
  ['/category/arcade/', '/'],
  ['/category/arcade', '/'],
  ['/category/action/', '/'],
  ['/category/action', '/'],
  ['/category/puzzle/', '/category/quiz-trivia'],
  ['/category/puzzle', '/category/quiz-trivia'],
];
// Static rules first, splat last. Do not add /game/heardle/ → /game/heardle here:
// with only heardle.html on disk, Pages already 308s that slash URL once.
// /game/heardle/index.html would 404 after leaving the directory layout, so it is listed.
const redirects = ['# Removed games and old categories'];
for (const [from, to] of legacy) {
  redirects.push(`${from} ${to} 301`);
  redirects.push(`/zh${from} ${to} 301`);
  if (from.endsWith('/') && from !== '/') {
    redirects.push(`${from}index.html ${to} 301`);
    redirects.push(`/zh${from}index.html ${to} 301`);
  }
}
redirects.push('# Former Chinese URLs');
redirects.push('/zh / 301', '/zh/ / 301', '/zh/index.html / 301');
for (const urlPath of pagePaths) {
  if (urlPath === '/') continue;
  const target = loc(DEF, urlPath);
  redirects.push(`/zh${target} ${target} 301`);
  redirects.push(`/zh${target}/ ${target} 301`);
  redirects.push(`/zh${target}/index.html ${target} 301`);
  redirects.push(`${target}/index.html ${target} 301`);
}
redirects.push('/zh/* /:splat 301');
write('_redirects', redirects.join('\n') + '\n');

for (const dir of fs.readdirSync(`${OUT}/games`)) {
  const file = `${OUT}/games/${dir}/index.html`;
  if (!fs.existsSync(file)) continue;
  const html = fs.readFileSync(file, 'utf8');
  if (!/name="robots"/.test(html)) {
    fs.writeFileSync(file, html.replace(/(<head[^>]*>)/i, '$1<meta name="robots" content="noindex">'));
  }
}
write('_headers', `/games/*\n  Cache-Control: public, max-age=86400\n  X-Robots-Tag: noindex\n/*\n  X-Content-Type-Options: nosniff\n`);

const home = fs.readFileSync(`${OUT}/index.html`, 'utf8');
const sitemap = fs.readFileSync(`${OUT}/sitemap.xml`, 'utf8');
const redirectFile = fs.readFileSync(`${OUT}/_redirects`, 'utf8');
const ogSize = pngSize(`${OUT}/og.png`);
if (ogSize.width !== 1200 || ogSize.height !== 630) throw new Error(`og.png is ${ogSize.width}x${ogSize.height}`);
const ico = fs.readFileSync(`${OUT}/favicon.ico`);
if (ico.readUInt16LE(0) !== 0 || ico.readUInt16LE(2) !== 1 || ico.readUInt16LE(4) !== 3) throw new Error('favicon.ico');
const manifest = JSON.parse(fs.readFileSync(`${OUT}/site.webmanifest`, 'utf8'));
const manifestIcons = (manifest.icons || []).map(icon => icon.src).join(' ');
if (!manifestIcons.includes('/android-chrome-192x192.png') || !manifestIcons.includes('/android-chrome-512x512.png')) throw new Error('manifest icons');
function walkHtml(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'games') continue;
      walkHtml(full, acc);
    } else if (entry.name.endsWith('.html')) acc.push(full);
  }
  return acc;
}
const iconNeedles = [
  'rel="icon" href="/favicon.ico" sizes="any"',
  'rel="icon" href="/favicon.svg" type="image/svg+xml"',
  'sizes="16x16" href="/favicon-16x16.png"',
  'sizes="32x32" href="/favicon-32x32.png"',
  'sizes="48x48" href="/favicon-48x48.png"',
  'rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png"',
  'rel="manifest" href="/site.webmanifest"',
  'aria-label="DLE HQ"',
  'class="logo-mark"',
  'name="twitter:image"',
  'property="og:image:width"',
  'property="og:image:height"',
];
for (const file of walkHtml(OUT)) {
  const html = fs.readFileSync(file, 'utf8');
  for (const needle of iconNeedles) {
    if (!html.includes(needle)) throw new Error(`${needle} missing in ${file}`);
  }
  if (html.includes('og:image" content="https://dlehq.com/favicon.svg"')) throw new Error('old og image in ' + file);
}
if (!home.includes('<title>DLE HQ – Daily Games Like Wordle: Play Free Unlimited Puzzle Games</title>')) throw new Error('homepage title');
if (!home.includes('property="og:image" content="https://dlehq.com/og.png"')) throw new Error('homepage og image');
if (!home.includes('property="og:image:width" content="1200"')) throw new Error('homepage og width');
if (!home.includes('property="og:image:height" content="630"')) throw new Error('homepage og height');
if (!home.includes('name="twitter:image" content="https://dlehq.com/og.png"')) throw new Error('homepage twitter image');
const about = fs.readFileSync(`${OUT}/about.html`, 'utf8');
if (!about.includes('property="og:image" content="https://dlehq.com/og.png"')) throw new Error('about og image');
for (const game of games) {
  const page = fs.readFileSync(`${OUT}/game/${game.slug}.html`, 'utf8');
  const expected = `property="og:image" content="${SITE}${game.thumb}"`;
  if (!page.includes(expected)) throw new Error('game og image ' + game.slug);
  if (!page.includes('property="og:image:width" content="320"') || !page.includes('property="og:image:height" content="180"')) throw new Error('game og size ' + game.slug);
  if (page.includes('https://dlehq.com/og.png')) throw new Error('game page dropped its own image ' + game.slug);
}
if (!home.includes('<h1>Daily Games Like Wordle</h1>')) throw new Error('homepage h1');
if (!home.includes('src="/games/wordle-unlimited/index.html"')) throw new Error('homepage embed');
if (/>Guides</.test(home)) throw new Error('empty guides section rendered');
if (/100\+/.test(home)) throw new Error('homepage claims 100+');
if (/googletag\.cmd|adsbygoogle|doubleclick|securepubads|adsense/i.test(home)) throw new Error('ads on homepage');
for (const slug of catSlugs) {
  const html = fs.readFileSync(`${OUT}/category/${slug}.html`, 'utf8');
  const thin = gamesIn(slug).length < 2;
  const expectedTitle = `<title>${esc(cat(slug, DEF).name)} DLE Games – Play Free Daily ${esc(cat(slug, DEF).name)} Puzzles | DLE HQ</title>`;
  const titled = html.includes(expectedTitle);
  if (!titled) throw new Error('category title ' + slug);
  if (thin && !html.includes('noindex')) throw new Error('missing noindex ' + slug);
  if (!thin && html.includes('noindex')) throw new Error('unexpected noindex ' + slug);
  const locTag = `<loc>${SITE}/category/${slug}</loc>`;
  if (thin && sitemap.includes(locTag)) throw new Error('thin category in sitemap ' + slug);
  if (!thin && !sitemap.includes(locTag)) throw new Error('indexable category missing from sitemap ' + slug);
}
for (const [from, to] of legacy) {
  if (!redirectFile.includes(`${from} ${to} 301`)) throw new Error('missing redirect ' + from);
  if (!redirectFile.includes(`/zh${from} ${to} 301`)) throw new Error('missing zh redirect ' + from);
}
if (!redirectFile.includes('/zh/ / 301') || !redirectFile.includes('/zh/* /:splat 301')) throw new Error('zh redirects dropped');
for (const game of games) {
  if (game.disclaimer) {
    const script = fs.readFileSync(`public/games/${game.slug}/game.js`, 'utf8');
    const page = fs.readFileSync(`${OUT}/game/${game.slug}.html`, 'utf8');
    if (!script.includes(game.disclaimer) || !page.includes(game.disclaimer)) throw new Error('disclaimer missing ' + game.slug);
  }
  const page = fs.readFileSync(`${OUT}/game/${game.slug}.html`, 'utf8');
  if (!page.includes(`<h1>${game.title}</h1>`)) throw new Error('h1 ' + game.slug);
  if (!page.includes(`<title>${game.title} – Play Free Online (Unlimited, No Download) | DLE HQ</title>`)) throw new Error('game title ' + game.slug);
  if (!page.includes('FAQPage') || !page.includes('BreadcrumbList')) throw new Error('schema ' + game.slug);
}
if (fs.existsSync(`${OUT}/games/snake`) || fs.existsSync(`${OUT}/games/2048`)) throw new Error('removed games still built');
function expectCanonical(file, expected) {
  const html = fs.readFileSync(file, 'utf8');
  const found = [...html.matchAll(/<link rel="canonical" href="([^"]+)">/g)].map(match => match[1]);
  const og = [...html.matchAll(/<meta property="og:url" content="([^"]+)">/g)].map(match => match[1]);
  if (found.length !== 1 || found[0] !== expected || og.length !== 1 || og[0] !== expected) {
    throw new Error(`canonical ${file}: ${found.join(',')} og ${og.join(',')} != ${expected}`);
  }
  if ((html.match(/rel="canonical"/g) || []).length !== 1) throw new Error('extra canonical ' + file);
}
expectCanonical(`${OUT}/index.html`, `${SITE}/`);
expectCanonical(`${OUT}/404.html`, `${SITE}/404`);
expectCanonical(`${OUT}/about.html`, `${SITE}/about`);
expectCanonical(`${OUT}/privacy.html`, `${SITE}/privacy`);
for (const slug of catSlugs) expectCanonical(`${OUT}/category/${slug}.html`, `${SITE}/category/${slug}`);
for (const game of games) expectCanonical(`${OUT}/game/${game.slug}.html`, `${SITE}/game/${game.slug}`);
for (const match of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) {
  const path = match[1].slice(SITE.length);
  if (path !== '/' && path.endsWith('/')) throw new Error('sitemap trailing slash ' + match[1]);
}
for (const line of redirectFile.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const dest = trimmed.split(/\s+/)[1];
  if (dest !== '/' && dest.endsWith('/')) throw new Error('redirect target trailing slash ' + trimmed);
}
console.log(`Built DLE HQ. Fresh through +${FRESH_DAYS} days from added date (today ${TODAY}).`);
for (const [slug, count] of Object.entries(counts)) console.log(`  ${slug}: ${count} words`);
console.log(`Sitemap URLs: ${indexedPaths.length}. Indexable categories: ${indexableCats().join(', ') || '(none)'}.`);

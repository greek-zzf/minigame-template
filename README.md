# DLE HQ

English-only static site for daily puzzle games. `node build.mjs` writes `dist/` for Cloudflare Pages (`_redirects`, `_headers`). No npm install. Node 18+.

```bash
npm run build      # dist/
npm run preview    # http://localhost:4173
```

## Layout

```
site.config.json          site name, URL, GA id, freshDays (default 5)
src/games.json            game records (slug, category, dates, embed)
src/categories.json       18 category slugs
src/articles/<slug>.mjs   game-page copy (how to play, rules, tips, FAQ)
src/guides.json           homepage Guides section; empty array hides it
locales/en.json           UI copy and category names
public/games/<slug>/      self-hosted game
build.mjs                 pages, sitemap, robots, _redirects
```

A category with fewer than 2 games is `noindex` and left out of `sitemap.xml`. That flips on the next build once a second game is filed there.

`added` (or `released`) keeps a page in Fresh Finds for at least `freshDays` after that date.

## Add a game

1. Put the game in `public/games/<slug>/` with `index.html` as the entry. The iframe page should send `noindex`.
2. Add a thumb at `public/thumbs/<slug>.svg`.
3. Add `src/articles/<slug>.mjs` with `howToTitle`, `rulesTitle`, `tipsTitle`, section blocks (`h3`, `p`, `ul`), and `faq`. Headings need the words free, unlimited, online, and “no download”, plus the page keyword. The built article must be 1,000–2,000 words.
4. Add a record to `src/games.json`: `slug`, `title`, `linkPhrase`, `category`, `tags`, `embed`, `thumb`, `orientation` (`board`, `tall`, `landscape`, or `square`), `short`, `added`, `released`, `popularity`, `keyword`. Set `featured: true` on the one game embedded on the homepage. Set `disclaimer` when the game must show an affiliation notice, and put that same sentence in the game script.
5. `npm run build`.

Removed URLs stay in `dist/_redirects` and `vercel.json`: `/game/snake/`, `/game/2048/`, `/category/arcade/`, and `/category/action/` go to `/`; `/category/puzzle/` goes to `/category/quiz-trivia/`. Former `/zh/` URLs still 301 to the English path, and removed Chinese URLs 301 straight to the new target.

The site does not render ads. Google Analytics still loads when `gaId` is set.

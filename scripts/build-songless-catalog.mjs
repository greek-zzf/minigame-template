// Samples category track ids from songless.pro (server-side; that API sends no CORS headers)
// and writes a static catalog. The game resolves previews in the browser via iTunes Lookup.
import fs from 'node:fs';

const UA = 'Mozilla/5.0 (compatible; dlehq-catalog/1.0)';
const BATCHES = 3; // up to 60 ids per category
const OUT = 'public/games/songless-unlimited/catalog.json';

const BLURB = {
  pop: 'Radio hooks, bright drums, and choruses you have heard in a shop.',
  rock: 'Guitars up front, from classic riffs to songs that still fill a room.',
  metal: 'Fast drums and heavy riffs. The intro is usually the whole clue.',
  alternative: 'Left-of-radio bands, odd textures, and choruses that take a second listen.',
  country: 'Story songs, twang, and the records that live on a highway station.',
  rap: 'Voices, ad-libs, and drum patterns you can name before the first bar ends.',
  'hip-hop': 'Beats and cadences from across hip-hop, not only this month’s chart.',
  'k-pop': 'Tight hooks, group chants, and productions built to hit immediately.',
  rnb: 'Smooth vocals, slow burns, and bass lines that give the singer away.',
  edm: 'Drops, synth stabs, and festival tracks that announce themselves fast.',
  'emo-pop-punk': 'Nasal hooks, power chords, and the songs a teenage car stereo wore out.',
  disco: 'Four-on-the-floor, strings, and bass lines made for a dance floor.',
  indie: 'Smaller bands, drier drums, and melodies that sneak up instead of shouting.',
  'anime-themes': 'Opening themes with a melody you can hum after one refrain.',
  'movie-soundtracks': 'Cues and songs that trail a scene you have already seen.',
  'tv-themes': 'Title music and needle-drops that belong to a series, not a chart.',
  musicals: 'Show tunes with a pit orchestra and a lyric that gives the show away.',
  disney: 'Songs from animated films that a lot of people learned as kids.',
  'superhero-soundtracks': 'Fanfares and score cues tied to capes, logos, and trailers.',
  'fantasy-adventure': 'Big themes from quests, wizards, and wide-open title cards.',
  'teen-drama-hits': 'The syncs and heartbreak songs that scored school-hall scenes.',
  '2020s': 'Current decade hits, still close enough that the production sounds new.',
  '2010s': 'Streaming-era pop, rap, and the choruses that dominated the 2010s.',
  '2000s': 'Early-digital pop, pop-punk, and R&B from the 2000s.',
  '1990s': 'CD-era rap, rock, and pop that still opens with a familiar snare.',
  '1980s': 'Drum machines, gated reverb, and choruses built for FM radio.',
  '1970s': 'Soul, rock, and disco from a decade of long intros and live bands.',
  '1960s': 'British invasion, Motown, and the three-minute singles of the 1960s.',
  '1950s': 'Early rock and roll, vocal groups, and records that still sound like a jukebox.',
  '1940s': 'Big band, crooners, and wartime songs with a full orchestra behind them.',
};

const SEARCH = {
  pop: 'pop hits',
  rock: 'classic rock',
  metal: 'heavy metal',
  alternative: 'alternative rock',
  country: 'country hits',
  rap: 'rap hits',
  'hip-hop': 'hip hop',
  'k-pop': 'k-pop',
  rnb: 'rnb hits',
  edm: 'edm hits',
  'emo-pop-punk': 'pop punk',
  disco: 'disco hits',
  indie: 'indie rock',
  'anime-themes': 'anime opening',
  'movie-soundtracks': 'movie soundtrack',
  'tv-themes': 'tv theme song',
  musicals: 'broadway musical',
  disney: 'disney songs',
  'superhero-soundtracks': 'superhero soundtrack',
  'fantasy-adventure': 'fantasy film score',
  'teen-drama-hits': 'teen pop',
  '2020s': '2020 hits',
  '2010s': '2010 hits',
  '2000s': '2000s hits',
  '1990s': '90s hits',
  '1980s': '80s hits',
  '1970s': '70s hits',
  '1960s': '60s hits',
  '1950s': '50s rock',
  '1940s': '1940s jazz',
};

async function getJson(url, opts) {
  const res = await fetch(url, { ...opts, headers: { 'user-agent': UA, ...(opts?.headers || {}) } });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || `${res.status} ${url}`);
  return data;
}

async function pool(categoryId, exclude) {
  return getJson('https://songless.pro/api/game/unlimited/pool', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      categoryId,
      market: 'GLOBAL',
      ...(exclude.length ? { excludeTrackIds: exclude } : {}),
    }),
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

const catalogRes = await getJson('https://songless.pro/api/music-categories?market=GLOBAL');
const categories = [];
for (const cat of catalogRes.categories || []) {
  const ids = [];
  const seen = new Set();
  for (let n = 0; n < BATCHES; n++) {
    let data;
    try {
      data = await pool(cat.id, ids);
    } catch (err) {
      console.warn('pool fail', cat.slug, err.message);
      break;
    }
    const batch = (data.trackIds || []).filter(id => Number.isInteger(id) && id > 0 && !seen.has(id));
    if (!batch.length) break;
    batch.forEach(id => seen.add(id));
    ids.push(...batch);
    if (batch.length < 20) break;
    await sleep(120);
  }
  categories.push({
    slug: cat.slug,
    name: cat.name,
    kind: cat.kind,
    blurb: BLURB[cat.slug] || `Songs filed under ${cat.name}.`,
    search: SEARCH[cat.slug] || cat.name,
    trackIds: ids,
  });
  console.log(`${cat.slug}: ${ids.length} tracks`);
  await sleep(80);
}

fs.mkdirSync('public/games/songless-unlimited', { recursive: true });
const body = {
  market: 'GLOBAL',
  sampledAt: new Date().toISOString().slice(0, 10),
  categories,
};
fs.writeFileSync(OUT, JSON.stringify(body));
const total = categories.reduce((n, c) => n + c.trackIds.length, 0);
console.log(`Wrote ${categories.length} categories, ${total} track ids -> ${OUT}`);

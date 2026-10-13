// Category play only (pick a lane, then guess songs from short clips).
// songless.pro's unlimited pool API is reachable from a server but sends no
// Access-Control-Allow-Origin, so this page cannot call it. catalog.json holds
// track ids sampled from that API. Previews load from the iTunes Lookup API,
// which responds with Access-Control-Allow-Origin: *.
const STAGES = [1, 2, 4, 7, 11, 16];
const POINTS = [100, 80, 60, 45, 30, 20];
const GROUPS = [['genre', 'Genres'], ['era', 'Decades'], ['vibe', 'Styles'], ['screen', 'Screen & stage']];
const BEST_KEY = 'dlehq-songless-unlimited';

const app = document.getElementById('app');
let catalog = [];
let category = null;
let ids = [];
let cursor = 0;
let queue = [];
let seen = new Set();
let token = 0;
let song = null;
let stage = 0;
let score = 0;
let streak = 0;
let best = loadBest();
let audio = null;
let playing = false;
let phase = 'boot';
let solvedRound = false;
let statusText = '';
let statusKind = '';
let suggestions = [];
let activePick = -1;
let inputValue = '';
let suggestTimer = 0;
let clipTimer = 0;

function loadBest() {
  try { return JSON.parse(localStorage.getItem(BEST_KEY) || '{}') || {}; }
  catch { return {}; }
}
function saveBest() {
  best.score = Math.max(best.score || 0, score);
  best.streak = Math.max(best.streak || 0, streak);
  try { localStorage.setItem(BEST_KEY, JSON.stringify({ score: best.score, streak: best.streak })); }
  catch { /* private mode */ }
}

function fold(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/\b(feat|ft|featuring)\.?\b/gi, ' ')
    .replace(/\b(radio edit|remaster(?:ed)?|single version|album version)\b/gi, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(the|a|an) /, '');
}

function judge(title, artist, trackId) {
  if (!song) return 'empty';
  if (trackId && String(trackId) === String(song.id)) return 'correct';
  const titleKey = fold(song.title);
  const artistKey = fold(song.artist);
  const guessTitle = fold(title);
  const guessArtist = fold(artist);
  const typed = fold([title, artist].filter(Boolean).join(' '));
  if (!typed) return 'empty';
  const bags = new Set([guessTitle, guessArtist, typed].filter(Boolean));
  if (bags.has(titleKey) || bags.has(fold(titleKey + ' ' + artistKey)) || bags.has(fold(artistKey + ' ' + titleKey))) return 'correct';
  if (artistKey && bags.has(artistKey)) return 'close';
  return 'wrong';
}

function el(tag, attrs, kids) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null) continue;
    if (key === 'class') node.className = value;
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, value);
  }
  for (const kid of kids || []) node.append(kid && kid.nodeType ? kid : document.createTextNode(kid ?? ''));
  return node;
}

function stats() {
  return el('div', { class: 'stats' }, [
    el('span', { class: 'stat' }, ['Score ', el('b', {}, [String(score)])]),
    el('span', { class: 'stat' }, ['Streak ', el('b', {}, [String(streak)])]),
    el('span', { class: 'stat' }, ['Best streak ', el('b', {}, [String(best.streak || 0)])]),
  ]);
}

function clearClipTimer() {
  if (clipTimer) clearTimeout(clipTimer);
  clipTimer = 0;
}
function stopAudio() {
  playing = false;
  clearClipTimer();
  if (!audio) return;
  audio.pause();
  audio.onended = null;
  audio.onerror = null;
  audio.ontimeupdate = null;
  try { audio.currentTime = 0; } catch { /* not ready */ }
}

function artUrl(row) {
  return String(row.artworkUrl100 || '').replace('100x100bb', '200x200bb');
}

async function itunes(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('itunes');
  return res.json();
}

async function lookup(idList) {
  const data = await itunes('https://itunes.apple.com/lookup?id=' + idList.join(',') + '&entity=song&country=us');
  return (data.results || []).filter(row => row.wrapperType === 'track' && row.kind === 'song' && row.previewUrl && row.trackName && row.artistName && !/\b(remix|mashup|karaoke|tribute)\b/i.test(row.trackName)).map(row => ({
    id: row.trackId, title: row.trackName, artist: row.artistName, preview: row.previewUrl, art: artUrl(row),
  }));
}

async function searchSongs(term) {
  const url = new URL('https://itunes.apple.com/search');
  url.searchParams.set('term', term);
  url.searchParams.set('entity', 'song');
  url.searchParams.set('limit', '8');
  const data = await itunes(url);
  const out = [];
  const keys = new Set();
  for (const row of data.results || []) {
    if (row.kind !== 'song' || !row.trackName || !row.artistName) continue;
    const key = fold(row.trackName) + '|' + fold(row.artistName);
    if (keys.has(key)) continue;
    keys.add(key);
    out.push({ id: row.trackId, title: row.trackName, artist: row.artistName });
  }
  return out.slice(0, 6);
}

function remember(list) {
  for (const item of list) {
    const key = fold(item.title) + '|' + fold(item.artist);
    if (seen.has(key)) continue;
    seen.add(key);
    queue.push(item);
  }
}

async function fill(myToken) {
  while (queue.length < 6 && cursor < ids.length) {
    if (myToken !== token) return;
    const batch = ids.slice(cursor, cursor + 20);
    cursor += batch.length;
    try { remember(await lookup(batch)); } catch { /* next batch */ }
  }
  if (myToken !== token || queue.length || !category) return;
  try {
    const url = new URL('https://itunes.apple.com/search');
    url.searchParams.set('term', category.search || category.name);
    url.searchParams.set('entity', 'song');
    url.searchParams.set('limit', '40');
    const data = await itunes(url);
    remember((data.results || []).filter(row => row.kind === 'song' && row.previewUrl && row.trackName).map(row => ({
      id: row.trackId, title: row.trackName, artist: row.artistName, preview: row.previewUrl, art: artUrl(row),
    })));
  } catch { /* empty queue is handled by the caller */ }
}

function shuffle(list) {
  const copy = list.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function setStatus(text, kind) {
  statusText = text || '';
  statusKind = kind || '';
  const node = document.querySelector('.status');
  if (!node) return;
  node.textContent = statusText;
  node.className = 'status' + (statusKind ? ' ' + statusKind : '');
}

function updatePlayButton() {
  const button = document.querySelector('.play');
  if (!button) return;
  button.textContent = playing ? 'Pause' : 'Play';
  button.setAttribute('aria-pressed', playing ? 'true' : 'false');
}

function playClip() {
  if (!song || phase !== 'play') return;
  if (!audio || audio.dataset.preview !== song.preview) {
    stopAudio();
    audio = new Audio(song.preview);
    audio.dataset.preview = song.preview;
    audio.preload = 'auto';
  }
  if (playing) {
    stopAudio();
    updatePlayButton();
    return;
  }
  const limit = STAGES[stage];
  const current = audio;
  try { current.currentTime = 0; } catch { /* starts at zero */ }
  clearClipTimer();
  const halt = () => {
    if (audio !== current) return;
    clearClipTimer();
    current.pause();
    playing = false;
    try { current.currentTime = 0; } catch { /* already stopped */ }
    updatePlayButton();
  };
  current.ontimeupdate = () => {
    if (current.currentTime >= limit - 0.05) halt();
  };
  clipTimer = setTimeout(halt, limit * 1000);
  current.onended = () => { playing = false; updatePlayButton(); };
  current.onerror = () => { playing = false; phase = 'broken'; render(); };
  const pending = current.play();
  if (pending && pending.then) {
    pending.then(() => { playing = true; updatePlayButton(); }).catch(() => {
      playing = false;
      updatePlayButton();
      setStatus('Press play to start the clip.');
    });
  }
}

function finish(won) {
  stopAudio();
  solvedRound = won;
  phase = 'reveal';
  if (won) {
    score += POINTS[stage];
    streak += 1;
  } else streak = 0;
  saveBest();
  render();
}

function giveAttempt(kind) {
  if (phase !== 'play') return;
  if (kind === 'correct') return finish(true);
  if (stage >= STAGES.length - 1) return finish(false);
  stage += 1;
  const note = kind === 'close' ? 'Right artist. The title is still open.' : kind === 'skip' ? 'Longer clip unlocked.' : 'Not that one. Listen again.';
  const tone = kind === 'close' ? 'close' : kind === 'skip' ? '' : 'bad';
  statusText = note;
  statusKind = tone;
  render();
  playClip();
}

function onGuess(title, artist, trackId) {
  const result = judge(title, artist, trackId);
  if (result === 'empty') return setStatus('Type a title or artist, or skip.');
  inputValue = '';
  suggestions = [];
  activePick = -1;
  giveAttempt(result);
}

function skipListen() {
  inputValue = '';
  suggestions = [];
  giveAttempt('skip');
}

async function nextSong() {
  if (phase === 'load') return;
  const myToken = ++token;
  stopAudio();
  audio = null;
  song = null;
  stage = 0;
  phase = 'load';
  statusText = '';
  suggestions = [];
  inputValue = '';
  render();
  if (queue.length < 4) await fill(myToken);
  if (myToken !== token) return;
  song = queue.shift() || null;
  if (!song) {
    phase = 'pick';
    category = null;
    statusText = 'No previews came back for that category. Try another lane.';
    statusKind = 'bad';
    render();
    return;
  }
  phase = 'play';
  statusText = 'Press play. The first listen is one second.';
  statusKind = '';
  render();
}

function chooseCategory(cat) {
  category = cat;
  ids = shuffle(cat.trackIds || []);
  cursor = 0;
  queue = [];
  seen = new Set();
  score = 0;
  streak = 0;
  phase = 'pick';
  nextSong();
}

function backToCategories() {
  token += 1;
  stopAudio();
  audio = null;
  song = null;
  category = null;
  phase = 'pick';
  statusText = '';
  statusKind = '';
  render();
}

function onType(value) {
  inputValue = value;
  activePick = -1;
  clearTimeout(suggestTimer);
  if (value.trim().length < 2) {
    suggestions = [];
    paintSuggestions();
    return;
  }
  suggestTimer = setTimeout(async () => {
    const query = value;
    try {
      const found = await searchSongs(query);
      if (query !== inputValue) return;
      suggestions = found;
      paintSuggestions();
    } catch {
      suggestions = [];
      paintSuggestions();
    }
  }, 220);
}

function paintSuggestions() {
  const host = document.querySelector('.suggest');
  if (!host) return;
  host.querySelector('.list')?.remove();
  if (!suggestions.length || phase !== 'play') return;
  const list = el('div', { class: 'list', role: 'listbox' });
  suggestions.forEach((item, index) => {
    const button = el('button', { type: 'button', role: 'option', class: index === activePick ? 'on' : '' }, [
      el('strong', {}, [item.title]),
      el('em', {}, [item.artist]),
    ]);
    button.addEventListener('mousedown', event => event.preventDefault());
    button.addEventListener('click', () => onGuess(item.title, item.artist, item.id));
    list.append(button);
  });
  host.append(list);
}

function movePick(delta) {
  if (!suggestions.length) return;
  if (activePick < 0) activePick = delta > 0 ? 0 : suggestions.length - 1;
  else activePick = (activePick + delta + suggestions.length) % suggestions.length;
  paintSuggestions();
}

function stageBar() {
  const bar = el('div', { class: 'stages' });
  STAGES.forEach((seconds, index) => {
    let cls = '';
    if (index < stage || (phase === 'reveal' && index <= stage)) cls = 'done';
    else if (index === stage && phase === 'play') cls = 'now';
    bar.append(el('i', { class: cls, title: seconds + ' seconds' }));
  });
  return bar;
}

function header() {
  return el('div', { class: 'top' }, [
    el('div', {}, [
      el('p', { class: 'brand' }, [category ? category.name : 'Songless Unlimited']),
      el('p', { class: 'sub' }, [category ? category.blurb : 'Pick a category, then guess the song from a short clip.']),
    ]),
    stats(),
  ]);
}

function render() {
  app.replaceChildren();
  if (phase === 'boot') {
    app.append(el('div', { class: 'screen center' }, [el('p', {}, ['Loading categories…'])]));
    return;
  }
  if (phase === 'pick' || !category) {
    const screen = el('div', { class: 'screen' }, [header()]);
    if (statusText) screen.append(el('p', { class: 'status bad' }, [statusText]));
    for (const [kind, label] of GROUPS) {
      const items = catalog.filter(cat => cat.kind === kind).sort((a, b) => kind === 'era'
        ? Number(b.slug.slice(0, 4)) - Number(a.slug.slice(0, 4))
        : a.name.localeCompare(b.name));
      if (!items.length) continue;
      screen.append(el('h2', {}, [label]));
      const grid = el('div', { class: 'grid' });
      for (const cat of items) {
        grid.append(el('button', { class: 'cat', type: 'button', onclick: () => chooseCategory(cat) }, [
          el('b', {}, [cat.name]),
          el('span', {}, [cat.blurb]),
        ]));
      }
      screen.append(grid);
    }
    screen.append(el('p', { class: 'note' }, ['Short previews stream from iTunes for identification. Recordings belong to their owners.']));
    app.append(screen);
    return;
  }

  const screen = el('div', { class: 'screen' }, [
    header(),
    el('button', { class: 'ghost', type: 'button', onclick: backToCategories }, ['All categories']),
    stageBar(),
  ]);

  if (phase === 'load') {
    screen.append(el('p', { class: 'meta' }, ['Finding a song…']));
    app.append(screen);
    return;
  }

  if (phase === 'broken') {
    screen.append(el('p', { class: 'status bad' }, ['This preview did not load. It will not count against your streak.']));
    screen.append(el('button', { class: 'go', type: 'button', onclick: nextSong }, ['Another song']));
    app.append(screen);
    return;
  }

  if (phase === 'reveal' && song) {
    screen.append(el('div', { class: 'card' }, [
      song.art ? el('img', { src: song.art, alt: '' }) : el('span', {}),
      el('div', {}, [el('h3', {}, [song.title]), el('p', {}, [song.artist])]),
    ]));
    screen.append(el('p', { class: 'status ' + (solvedRound ? 'ok' : 'bad') }, [
      solvedRound ? `Solved on a ${STAGES[stage]}-second listen. +${POINTS[stage]} points.` : 'That was the last listen.',
    ]));
    screen.append(el('button', { class: 'go', type: 'button', onclick: nextSong }, ['Next song']));
    app.append(screen);
    return;
  }

  screen.append(el('p', { class: 'meta' }, [`Step ${stage + 1} of ${STAGES.length} · ${STAGES[stage]} second${STAGES[stage] === 1 ? '' : 's'}`]));
  screen.append(el('button', { class: 'play', type: 'button', 'aria-pressed': 'false', onclick: playClip }, ['Play']));
  const input = el('input', {
    type: 'text',
    placeholder: 'Song title or artist',
    'aria-label': 'Guess the song title or artist',
    autocomplete: 'off',
    spellcheck: 'false',
    value: inputValue,
  });
  input.addEventListener('input', () => onType(input.value));
  input.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown') { event.preventDefault(); movePick(1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); movePick(-1); }
    else if (event.key === 'Escape') { suggestions = []; activePick = -1; paintSuggestions(); }
    else if (event.key === 'Enter') {
      event.preventDefault();
      if (activePick >= 0 && suggestions[activePick]) {
        const pick = suggestions[activePick];
        onGuess(pick.title, pick.artist, pick.id);
      } else onGuess(input.value, '', null);
    }
  });
  screen.append(el('div', { class: 'row' }, [
    el('div', { class: 'suggest' }, [input]),
    el('button', { class: 'go', type: 'button', onclick: () => onGuess(input.value, '', null) }, ['Guess']),
    el('button', { class: 'skip', type: 'button', onclick: skipListen }, ['Skip']),
  ]));
  screen.append(el('p', { class: 'status' + (statusKind ? ' ' + statusKind : '') }, [statusText]));
  screen.append(el('p', { class: 'note' }, ['A matching title solves the round. Naming only the artist is a close guess and spends a step.']));
  app.append(screen);
  paintSuggestions();
}

async function boot() {
  render();
  try {
    const res = await fetch('catalog.json');
    if (!res.ok) throw new Error('catalog');
    const data = await res.json();
    catalog = (data.categories || []).filter(cat => cat && cat.slug && cat.name);
  } catch { catalog = []; }
  phase = 'pick';
  statusText = catalog.length ? '' : 'Categories failed to load. Refresh the page.';
  statusKind = catalog.length ? '' : 'bad';
  render();
}

boot();

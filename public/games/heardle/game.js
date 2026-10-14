// Hookstep: one daily song, six attempts, a growing preview. Not a Spotify or Heardle client.
const DISCLAIMER = 'Unofficial fan-made game. Not affiliated with Spotify or Heardle.';
const STAGES = [1, 2, 4, 7, 11, 16];
const STORE = 'dlehq-hookstep';

const app = document.getElementById('app');
let ids = [];
let mode = 'daily';
let song = null;
let stage = 0;
let marks = [];
let phase = 'boot';
let statusText = 'Loading today’s puzzle…';
let statusKind = '';
let audio = null;
let playing = false;
let clipTimer = 0;
let suggestions = [];
let activePick = -1;
let inputValue = '';
let suggestTimer = 0;
let dailyRecord = loadRecord();

function loadRecord() {
  try { return JSON.parse(localStorage.getItem(STORE) || 'null'); }
  catch { return null; }
}
function saveRecord(record) {
  dailyRecord = record;
  try { localStorage.setItem(STORE, JSON.stringify(record)); }
  catch { /* private mode */ }
}

function dayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function hash(value) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function prettyDay(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en', { month: 'short', day: 'numeric' });
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

async function itunes(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('itunes');
  return res.json();
}

function mapRow(row) {
  return {
    id: row.trackId,
    title: row.trackName,
    artist: row.artistName,
    preview: row.previewUrl,
    art: String(row.artworkUrl100 || '').replace('100x100bb', '200x200bb'),
  };
}

async function resolveSong(start) {
  const batch = [];
  for (let step = 0; step < 8; step++) batch.push(ids[(start + step) % ids.length]);
  const data = await itunes('https://itunes.apple.com/lookup?id=' + batch.join(',') + '&entity=song&country=us');
  const byId = new Map();
  for (const row of data.results || []) {
    if (row.wrapperType === 'track' && row.kind === 'song' && row.previewUrl && row.trackName && row.artistName) {
      byId.set(row.trackId, mapRow(row));
    }
  }
  for (const id of batch) if (byId.has(id)) return byId.get(id);
  return null;
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

function setStatus(text, kind) {
  statusText = text || '';
  statusKind = kind || '';
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
  current.onerror = () => { playing = false; setStatus('This preview did not start. Try play again.', 'bad'); render(); };
  const pending = current.play();
  if (pending && pending.then) {
    pending.then(() => { playing = true; updatePlayButton(); }).catch(() => {
      playing = false;
      setStatus('Press play to start the clip.');
      render();
    });
  }
}

function updatePlayButton() {
  const button = document.querySelector('.play');
  if (!button) return;
  button.textContent = playing ? 'Pause' : 'Play intro';
  button.setAttribute('aria-pressed', playing ? 'true' : 'false');
}

function persistDaily() {
  if (mode !== 'daily' || !song) return;
  saveRecord({
    date: dayKey(),
    trackId: song.id,
    stage,
    marks: marks.slice(),
    status: phase === 'reveal' ? (marks.includes('correct') ? 'won' : 'lost') : 'playing',
  });
}

function finish(kind) {
  stopAudio();
  marks.push(kind);
  phase = 'reveal';
  setStatus(kind === 'correct' ? `Named it on a ${STAGES[stage]}-second listen.` : 'That was the last listen.', kind === 'correct' ? 'ok' : 'bad');
  persistDaily();
  render();
}

function giveAttempt(kind) {
  if (phase !== 'play') return;
  if (kind === 'correct') return finish('correct');
  marks.push(kind);
  if (stage >= STAGES.length - 1) {
    phase = 'reveal';
    stopAudio();
    setStatus('That was the last listen.', 'bad');
    persistDaily();
    render();
    return;
  }
  stage += 1;
  const note = kind === 'close' ? 'Right artist. The title is still open.' : kind === 'skip' ? 'Longer intro unlocked.' : 'Not that one. Listen again.';
  setStatus(note, kind === 'close' ? 'close' : kind === 'skip' ? '' : 'bad');
  persistDaily();
  render();
  playClip();
}

function onGuess(title, artist, trackId) {
  const result = judge(title, artist, trackId);
  if (result === 'empty') return setStatus('Type a title or artist, or skip.', 'bad'), render();
  inputValue = '';
  suggestions = [];
  activePick = -1;
  giveAttempt(result);
}

function shareText() {
  const symbols = marks.map(mark => (mark === 'correct' ? '●' : mark === 'close' ? '◐' : '○')).join('');
  const heard = marks.includes('correct') ? STAGES[Math.max(0, marks.length - 1)] : STAGES[STAGES.length - 1];
  return [
    `Hookstep ${marks.includes('correct') ? marks.length : 'X'}/${STAGES.length}`,
    symbols,
    `Intro reached ${heard}s`,
    DISCLAIMER,
  ].join('\n');
}

async function share() {
  const text = shareText();
  try {
    await navigator.clipboard.writeText(text);
    setStatus('Result copied.', 'ok');
  } catch {
    setStatus(text, '');
  }
  render();
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

function movePick(delta) {
  if (!suggestions.length) return;
  if (activePick < 0) activePick = delta > 0 ? 0 : suggestions.length - 1;
  else activePick = (activePick + delta + suggestions.length) % suggestions.length;
  paintSuggestions();
}

function stageBar() {
  const bar = el('div', { class: 'stages', 'aria-label': 'Intro lengths' });
  STAGES.forEach((seconds, index) => {
    let cls = '';
    if (index < stage || (phase === 'reveal' && index <= stage && marks.length)) cls = 'done';
    else if (index === stage && phase === 'play') cls = 'now';
    bar.append(el('b', { class: cls, title: seconds + ' seconds' }));
  });
  return bar;
}

function header() {
  const today = dayKey();
  const label = mode === 'practice' ? 'Practice round' : `Today’s puzzle · ${prettyDay(today)}`;
  return el('div', {}, [
    el('div', { class: 'top' }, [
      el('div', { class: 'bars', 'aria-hidden': 'true' }, [el('i'), el('i'), el('i'), el('i'), el('i'), el('i')]),
      el('div', {}, [
        el('p', { class: 'brand' }, ['Hookstep']),
        el('p', { class: 'sub' }, [label]),
      ]),
    ]),
    el('p', { class: 'legal' }, [DISCLAIMER]),
  ]);
}

function render() {
  app.replaceChildren();
  const screen = el('div', { class: 'screen' + (phase === 'boot' ? ' center' : '') });
  screen.append(header());
  if (phase === 'boot' || phase === 'load') {
    screen.append(el('p', { class: 'meta' }, [statusText || 'Loading…']));
    app.append(screen);
    return;
  }
  if (phase === 'error') {
    screen.append(el('p', { class: 'status bad' }, [statusText]));
    screen.append(el('button', { class: 'go', type: 'button', onclick: () => boot() }, ['Try again']));
    app.append(screen);
    return;
  }
  screen.append(stageBar());
  if (phase === 'reveal' && song) {
    screen.append(el('div', { class: 'card' }, [
      song.art ? el('img', { src: song.art, alt: `${song.title} by ${song.artist}` }) : el('span'),
      el('div', {}, [el('h2', {}, [song.title]), el('p', {}, [song.artist])]),
    ]));
    screen.append(el('p', { class: 'status ' + (statusKind || '') }, [statusText]));
    const actions = el('div', { class: 'actions' });
    if (mode === 'daily') {
      actions.append(el('button', { class: 'go', type: 'button', onclick: share }, ['Share result']));
      actions.append(el('button', { class: 'ghost', type: 'button', onclick: startPractice }, ['Practice another song']));
    } else {
      actions.append(el('button', { class: 'go', type: 'button', onclick: startPractice }, ['Another practice song']));
      actions.append(el('button', { class: 'ghost', type: 'button', onclick: showDailyResult }, ['Back to today’s result']));
    }
    screen.append(actions);
    screen.append(el('p', { class: 'note' }, ['The clip is the start of a short preview used for identification. Recordings belong to their owners.']));
    app.append(screen);
    return;
  }
  screen.append(el('p', { class: 'meta' }, [`Attempt ${stage + 1} of ${STAGES.length} · ${STAGES[stage]} second${STAGES[stage] === 1 ? '' : 's'}`]));
  screen.append(el('button', { class: 'play', type: 'button', 'aria-pressed': 'false', onclick: playClip }, ['Play intro']));
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
    el('button', { class: 'skip', type: 'button', onclick: () => { inputValue = ''; suggestions = []; giveAttempt('skip'); } }, ['Skip']),
  ]));
  screen.append(el('p', { class: 'status' + (statusKind ? ' ' + statusKind : '') }, [statusText]));
  screen.append(el('p', { class: 'note' }, ['A matching title solves the round. Naming only the artist is a close guess and spends an attempt.']));
  app.append(screen);
  paintSuggestions();
  if (playing) updatePlayButton();
}

async function openSong(startIndex, nextMode) {
  phase = 'load';
  mode = nextMode;
  song = null;
  stopAudio();
  audio = null;
  setStatus(nextMode === 'practice' ? 'Finding a practice song…' : 'Loading today’s puzzle…');
  render();
  try {
    song = await resolveSong(startIndex);
  } catch {
    song = null;
  }
  if (!song) {
    phase = 'error';
    setStatus('No preview came back. Check the connection and try again.', 'bad');
    render();
    return;
  }
  if (nextMode === 'daily' && dailyRecord && dailyRecord.date === dayKey() && dailyRecord.trackId === song.id && dailyRecord.status !== 'playing') {
    stage = Math.max(0, (dailyRecord.marks || []).length - 1);
    marks = (dailyRecord.marks || []).slice();
    phase = 'reveal';
    setStatus(dailyRecord.status === 'won' ? 'You already named today’s song.' : 'Today’s puzzle is already finished.', dailyRecord.status === 'won' ? 'ok' : 'bad');
    render();
    return;
  }
  if (nextMode === 'daily' && dailyRecord && dailyRecord.date === dayKey() && dailyRecord.trackId === song.id && dailyRecord.status === 'playing') {
    marks = (dailyRecord.marks || []).slice();
    stage = Math.min(STAGES.length - 1, marks.length);
  } else {
    marks = [];
    stage = 0;
  }
  phase = 'play';
  inputValue = '';
  suggestions = [];
  setStatus('Press play. The first listen is one second.');
  if (nextMode === 'daily') persistDaily();
  render();
}

function startPractice() {
  const avoid = song ? song.id : 0;
  let start = hash(dayKey() + ':practice:' + Date.now()) % ids.length;
  if (ids[start] === avoid) start = (start + 1) % ids.length;
  openSong(start, 'practice');
}

function showDailyResult() {
  const today = dayKey();
  if (dailyRecord && dailyRecord.date === today) boot();
  else openSong(hash('hookstep:' + today) % ids.length, 'daily');
}

async function boot() {
  phase = 'boot';
  setStatus('Loading today’s puzzle…');
  render();
  try {
    const res = await fetch('../songless-unlimited/catalog.json');
    if (!res.ok) throw new Error('catalog');
    const data = await res.json();
    const set = new Set();
    for (const cat of data.categories || []) for (const id of cat.trackIds || []) if (id > 0) set.add(id);
    ids = [...set].sort((a, b) => a - b);
    if (!ids.length) throw new Error('catalog');
  } catch {
    phase = 'error';
    setStatus('The song list failed to load. Refresh the page.', 'bad');
    render();
    return;
  }
  const today = dayKey();
  dailyRecord = loadRecord();
  let start;
  if (dailyRecord && dailyRecord.date === today && dailyRecord.trackId) {
    const savedIndex = ids.indexOf(dailyRecord.trackId);
    start = savedIndex >= 0 ? savedIndex : hash('hookstep:' + today) % ids.length;
  } else {
    start = hash('hookstep:' + today) % ids.length;
  }
  await openSong(start, 'daily');
}

window.addEventListener('pagehide', stopAudio);
boot();

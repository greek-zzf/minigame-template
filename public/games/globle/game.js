// Waymark: unlimited mystery-country guesses. Own field-notebook board, not a map clone.
const DISCLAIMER = 'Unofficial fan-made game. Not affiliated with Globle.';
const STORE = 'dlehq-waymark';

const app = document.getElementById('app');
const ui = {};
let countries = [];
let answer = null;
let rows = [];
let phase = 'load';
let query = '';
let hi = 0;
let message = 'Loading countries…';
let messageBad = false;
let stats = loadStats();

const BANDS = [
  { max: 400, id: 'hot', name: 'very close', hint: 'Under 400 km' },
  { max: 1200, id: 'warm', name: 'close', hint: 'Under 1,200 km' },
  { max: 3000, id: 'mild', name: 'mid range', hint: 'Under 3,000 km' },
  { max: 6500, id: 'cool', name: 'far', hint: 'Under 6,500 km' },
  { max: Infinity, id: 'cold', name: 'very far', hint: '6,500 km or more' },
];
const POINTS = [
  [22.5, 'north', 'N', '↑'],
  [67.5, 'northeast', 'NE', '↗'],
  [112.5, 'east', 'E', '→'],
  [157.5, 'southeast', 'SE', '↘'],
  [202.5, 'south', 'S', '↓'],
  [247.5, 'southwest', 'SW', '↙'],
  [292.5, 'west', 'W', '←'],
  [337.5, 'northwest', 'NW', '↖'],
  [360, 'north', 'N', '↑'],
];

function loadStats() {
  try { return JSON.parse(localStorage.getItem(STORE) || '{}') || {}; }
  catch { return {}; }
}
function saveStats() {
  try { localStorage.setItem(STORE, JSON.stringify(stats)); }
  catch { /* private mode */ }
}
function el(tag, attrs, kids) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, value);
  }
  for (const kid of kids || []) node.append(kid && kid.nodeType ? kid : document.createTextNode(kid ?? ''));
  return node;
}
function normalize(value) {
  return String(value || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function rad(n) { return n * Math.PI / 180; }
function distance(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h))));
}
function bearing(a, b) {
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
function pointFrom(deg) {
  return POINTS.find(item => deg < item[0]) || POINTS[0];
}
function bandFor(km) {
  if (km === 0) return { id: 'found', name: 'found', hint: '0 km' };
  return BANDS.find(item => km < item.max);
}
function formatKm(km) {
  return `${km.toLocaleString('en-US')} km`;
}
function rank(country, text) {
  const n = normalize(text);
  if (!n) return 99;
  const name = normalize(country.name);
  if (name === n) return 0;
  if (name.startsWith(n)) return 1;
  if (name.split(' ').some(word => word.startsWith(n))) return 2;
  let best = 99;
  for (const alias of country.aliases) {
    const a = normalize(alias);
    if (!a) continue;
    if (a === n) best = Math.min(best, 0);
    else if (a.startsWith(n)) best = Math.min(best, 3);
    else if (a.split(' ').some(word => word.startsWith(n))) best = Math.min(best, 4);
  }
  return best;
}
function suggestions(text) {
  return countries
    .map(country => ({ country, score: rank(country, text) }))
    .filter(item => item.score < 99)
    .sort((a, b) => a.score - b.score || a.country.name.localeCompare(b.country.name))
    .slice(0, 6)
    .map(item => item.country);
}
function exact(text) {
  const n = normalize(text);
  if (!n) return null;
  return countries.find(country => normalize(country.name) === n || country.aliases.some(alias => normalize(alias) === n)) || null;
}
function pickAnswer() {
  const recent = new Set(stats.recent || []);
  let pool = countries.filter(country => !recent.has(country.code));
  if (pool.length < 30) pool = countries.slice();
  return pool[Math.floor(Math.random() * pool.length)];
}
function remember(code) {
  const recent = stats.recent || [];
  if (recent[recent.length - 1] !== code) recent.push(code);
  stats.recent = recent.slice(-40);
  saveStats();
}
function rose() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 64 64');
  svg.setAttribute('class', 'rose');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = '<circle cx="32" cy="32" r="30" fill="none" stroke="#1a2a22" stroke-width="2"/><path d="M32 6 L36 28 L32 24 L28 28 Z" fill="#1f6b45"/><path d="M32 58 L28 36 L32 40 L36 36 Z" fill="#1a2a22"/><path d="M6 32 L28 28 L24 32 L28 36 Z" fill="#6f93a3"/><path d="M58 32 L36 36 L40 32 L36 28 Z" fill="#e07a45"/>';
  return svg;
}
function mount() {
  ui.solved = el('p', { class: 'solved' });
  ui.msg = el('p', { class: 'msg', 'aria-live': 'polite' });
  ui.input = el('input', { id: 'guess', type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'go', 'aria-autocomplete': 'list', 'aria-controls': 'suggest' });
  ui.list = el('div', { id: 'suggest', class: 'suggest', role: 'listbox' });
  ui.log = el('ol', { class: 'log' });
  ui.again = el('button', { class: 'again', type: 'button', onclick: playAgain }, ['Play again']);
  const form = el('form', { class: 'ask', onsubmit: event => { event.preventDefault(); commit(); } }, [
    el('label', { for: 'guess' }, ['Guess a country']),
    el('div', { class: 'field' }, [
      ui.input,
      el('button', { class: 'go', type: 'submit' }, ['Guess']),
    ]),
    ui.list,
  ]);
  ui.input.addEventListener('input', () => {
    query = ui.input.value;
    hi = 0;
    messageBad = false;
    paint();
  });
  ui.input.addEventListener('keydown', event => {
    const items = suggestions(query);
    if (event.key === 'ArrowDown' && items.length) {
      event.preventDefault();
      hi = Math.min(items.length - 1, hi + 1);
      paint();
    } else if (event.key === 'ArrowUp' && items.length) {
      event.preventDefault();
      hi = Math.max(0, hi - 1);
      paint();
    } else if (event.key === 'Escape') {
      ui.list.hidden = true;
    }
  });
  app.replaceChildren(el('div', { class: 'screen' }, [
    el('div', { class: 'top' }, [
      el('div', {}, [
        el('h1', { class: 'mark' }, ['Waymark']),
        el('p', { class: 'sub' }, ['A bearing after every country.']),
      ]),
      rose(),
    ]),
    el('p', { class: 'legal' }, [DISCLAIMER]),
    ui.solved,
    ui.msg,
    form,
    ui.again,
    ui.log,
    el('p', { class: 'credit' }, ['Country names, capitals, centre points, and land borders are derived from mledoze/countries under the ODbL.']),
  ]));
}
function paint() {
  ui.solved.textContent = '';
  ui.solved.append('Solved on this device: ', el('b', {}, [String(stats.solved || 0)]));
  ui.msg.textContent = message;
  ui.msg.className = messageBad ? 'msg bad' : 'msg';
  ui.again.hidden = phase !== 'end';
  ui.input.disabled = phase !== 'play';
  const items = phase === 'play' ? suggestions(query) : [];
  ui.list.hidden = items.length === 0;
  ui.list.replaceChildren(...items.map((country, index) => el('button', {
    type: 'button',
    role: 'option',
    class: index === hi ? 'on' : '',
    'aria-selected': index === hi ? 'true' : 'false',
    onmousedown: event => { event.preventDefault(); guess(country); },
  }, [country.name])));
  ui.log.replaceChildren(...rows.map(row => {
    const swatch = el('span', { class: `swatch ${row.band.id}`, title: row.band.hint });
    const kmKids = [formatKm(row.km)];
    if (row.dirName) kmKids.push(' ', el('span', { class: 'bearing', 'aria-label': row.dirName }, [`${row.arrow} ${row.dirShort}`]));
    return el('li', {}, [
      swatch,
      el('span', {}, [el('span', { class: 'name' }, [row.name]), el('span', { class: 'cmp' }, [row.compare])]),
      el('span', { class: 'km' }, kmKids),
    ]);
  }));
}
function commit() {
  if (phase !== 'play') return;
  const found = exact(query);
  if (found) return guess(found);
  const items = suggestions(query);
  if (items.length === 1) return guess(items[0]);
  if (items[hi]) return guess(items[hi]);
  message = query.trim() ? 'Pick a country from the list.' : 'Type a country.';
  messageBad = true;
  paint();
}
function guess(country) {
  if (phase !== 'play') return;
  if (rows.some(row => row.code === country.code)) {
    message = 'Already guessed.';
    messageBad = true;
    paint();
    return;
  }
  const found = country.code === answer.code;
  const km = found ? 0 : distance(country, answer);
  const dir = found ? null : pointFrom(bearing(country, answer));
  const previous = rows[0];
  let compare = 'first guess';
  if (found) compare = 'found';
  else if (previous) {
    if (km < previous.km) compare = 'warmer';
    else if (km > previous.km) compare = 'colder';
    else compare = 'same distance';
  }
  rows.unshift({
    code: country.code,
    name: country.name,
    km,
    compare,
    band: bandFor(km),
    arrow: dir ? dir[3] : '',
    dirShort: dir ? dir[2] : '',
    dirName: dir ? dir[1] : '',
  });
  query = '';
  hi = 0;
  ui.input.value = '';
  messageBad = false;
  if (country.code === answer.code) return finish();
  message = `${country.name}: ${formatKm(km)}, ${dir[1]}.`;
  paint();
}
function finish() {
  phase = 'end';
  stats.solved = (stats.solved || 0) + 1;
  remember(answer.code);
  saveStats();
  const n = rows.length;
  message = `Found in ${n} ${n === 1 ? 'guess' : 'guesses'}. It was ${answer.name}.`;
  messageBad = false;
  paint();
}
function playAgain() {
  answer = pickAnswer();
  rows = [];
  query = '';
  hi = 0;
  phase = 'play';
  message = 'A new mystery country. Guess as many times as you need.';
  messageBad = false;
  ui.input.value = '';
  paint();
  ui.input.focus();
}
async function boot() {
  mount();
  paint();
  try {
    const response = await fetch('countries.json');
    if (!response.ok) throw new Error('status');
    countries = await response.json();
    answer = pickAnswer();
    phase = 'play';
    message = 'A mystery country is set. Type a name, then guess.';
    paint();
  } catch {
    phase = 'load';
    message = 'The country list did not load.';
    messageBad = true;
    paint();
    app.querySelector('.screen').append(el('button', { class: 'again', type: 'button', onclick: () => location.reload() }, ['Try again']));
  }
}
boot();

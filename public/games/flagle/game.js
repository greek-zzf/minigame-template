// Bunting: six flag guesses, then shape, capital, and border bonuses. Own linen board.
const DISCLAIMER = 'Unofficial fan-made game. Not affiliated with Flagle.';
const STORE = 'dlehq-bunting';
const TRIES = 6;

const app = document.getElementById('app');
const ui = {};
let countries = [];
let byCode = new Map();
let answer = null;
let rows = [];
let phase = 'load';
let query = '';
let hi = 0;
let message = 'Loading flags…';
let messageBad = false;
let queue = [];
let bonusAt = 0;
let bonus = null;
let bonusRight = 0;
let bonusAsked = 0;
let stats = loadStats();

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
function svgEl(tag, attrs) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attrs || {})) node.setAttribute(key, value);
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
function formatKm(km) {
  return `${km.toLocaleString('en-US')} km`;
}
function shuffle(list) {
  const copy = list.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
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
  stats.recent = recent.slice(-50);
  saveStats();
}
function distractors(target, n, ok) {
  const picked = [];
  const seen = new Set();
  const pools = [
    countries.filter(country => country.subregion === target.subregion),
    countries.filter(country => country.region === target.region),
    countries,
  ];
  for (const pool of pools) {
    for (const item of shuffle(pool)) {
      if (item.code === target.code || seen.has(item.code) || !ok(item)) continue;
      seen.add(item.code);
      picked.push(item);
      if (picked.length === n) return picked;
    }
  }
  return picked;
}
function pennants() {
  const svg = svgEl('svg', { viewBox: '0 0 64 36', class: 'pennants', 'aria-hidden': 'true' });
  svg.append(
    svgEl('path', { d: 'M4 6 H60', stroke: '#241c33', 'stroke-width': '2', fill: 'none' }),
    svgEl('path', { d: 'M14 6 L22 16 L30 6 Z', fill: '#c44536' }),
    svgEl('path', { d: 'M28 6 L36 18 L44 6 Z', fill: '#2c6b5a' }),
    svgEl('path', { d: 'M42 6 L50 14 L58 6 Z', fill: '#e4b15a' }),
  );
  return svg;
}
function shapeSvg(d) {
  const svg = svgEl('svg', { viewBox: '0 0 100 100', 'aria-hidden': 'true' });
  svg.append(svgEl('path', { d }));
  return svg;
}
function mount() {
  ui.solved = el('p', { class: 'solved' });
  ui.pegs = el('div', { class: 'pegs', 'aria-hidden': 'true' });
  ui.flag = el('img', { class: 'flag', width: '640', height: '480', alt: 'Mystery flag' });
  ui.msg = el('p', { class: 'msg', 'aria-live': 'polite' });
  ui.input = el('input', { id: 'guess', type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'go', 'aria-controls': 'suggest' });
  ui.list = el('div', { id: 'suggest', class: 'suggest', role: 'listbox' });
  ui.form = el('form', { class: 'ask', onsubmit: event => { event.preventDefault(); commit(); } }, [
    el('label', { for: 'guess' }, ['Guess the country']),
    el('div', { class: 'field' }, [ui.input, el('button', { class: 'go', type: 'submit' }, ['Guess'])]),
    ui.list,
  ]);
  ui.tries = el('ol', { class: 'tries' });
  ui.bonus = el('section', { class: 'bonus' });
  ui.next = el('button', { class: 'next', type: 'button', onclick: nextCountry }, ['Next country']);
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
    } else if (event.key === 'Escape') ui.list.hidden = true;
  });
  app.replaceChildren(el('div', { class: 'screen' }, [
    el('div', { class: 'top' }, [
      el('div', { class: 'brand' }, [
        pennants(),
        el('div', {}, [
          el('h1', { class: 'mark' }, ['Bunting']),
          el('p', { class: 'sub' }, ['Six tries, then the extras.']),
        ]),
      ]),
      ui.pegs,
    ]),
    el('p', { class: 'legal' }, [DISCLAIMER]),
    ui.solved,
    el('div', { class: 'flag-wrap' }, [ui.flag]),
    ui.msg,
    ui.form,
    ui.tries,
    ui.bonus,
    ui.next,
    el('p', { class: 'credit' }, ['Flags from flag-icons (MIT). Outlines simplified from mapsicon by Régis Freyd. Country facts derived from mledoze/countries (ODbL).']),
  ]));
}
function paint() {
  ui.solved.textContent = '';
  ui.solved.append('Flags solved on this device: ', el('b', {}, [String(stats.solved || 0)]));
  ui.msg.textContent = message;
  ui.msg.className = messageBad ? 'msg bad' : 'msg';
  const guessing = phase === 'guess';
  ui.form.hidden = !guessing;
  ui.input.disabled = !guessing;
  ui.next.hidden = phase !== 'done';
  ui.bonus.hidden = phase !== 'bonus' && phase !== 'done';
  if (answer && phase !== 'load') {
    ui.flag.src = `flags/${answer.code}.svg`;
    ui.flag.alt = phase === 'guess' ? 'Mystery flag' : `Flag of ${answer.name}`;
  }
  ui.pegs.replaceChildren(...Array.from({ length: TRIES }, (_, index) => {
    const hit = rows[index] && rows[index].code === answer?.code;
    const used = index < rows.length;
    return el('i', { class: hit ? 'hit' : used ? 'used' : '' });
  }));
  const items = guessing ? suggestions(query) : [];
  ui.list.hidden = items.length === 0;
  ui.list.replaceChildren(...items.map((country, index) => el('button', {
    type: 'button',
    role: 'option',
    class: index === hi ? 'on' : '',
    'aria-selected': index === hi ? 'true' : 'false',
    onmousedown: event => { event.preventDefault(); guess(country); },
  }, [country.name])));
  ui.tries.replaceChildren(...rows.map((row, index) => el('li', {}, [
    el('span', { class: 'n' }, [String(index + 1)]),
    el('span', {}, [
      el('b', {}, [row.name]),
      el('span', { class: 'meta' }, [row.found ? 'Correct country' : `${formatKm(row.km)} · ${row.arrow} ${row.dirShort}`]),
    ]),
  ])));
  paintBonus();
}
function paintBonus() {
  ui.bonus.replaceChildren();
  if (phase !== 'bonus' && phase !== 'done') return;
  const skips = [];
  if (answer && !answer.shape) skips.push('Shape skipped: no outline in this build.');
  if (answer && !answer.neighbors.length) skips.push('Borders skipped: no land neighbour in this list.');
  if (phase === 'done') {
    ui.bonus.append(
      el('h2', {}, ['Round complete']),
      el('p', {}, [`Bonus: ${bonusRight} of ${bonusAsked}.`]),
      skips.length ? el('p', { class: 'note' }, [skips.join(' ')]) : '',
    );
    return;
  }
  const heading = bonus.kind === 'shape' ? 'Shape' : bonus.kind === 'capital' ? 'Capital' : 'Borders';
  ui.bonus.append(
    el('h2', {}, [`${heading} · ${bonusAt + 1} of ${queue.length}`]),
    el('p', {}, [bonus.prompt]),
  );
  const choices = el('div', { class: 'choices' });
  bonus.options.forEach((option, index) => {
    const kids = [];
    if (option.shape) kids.push(shapeSvg(option.shape));
    const caption = bonus.picked
      ? (option.correct ? 'Correct' : option.id === bonus.picked ? 'Not this one' : '')
      : (option.label || `Outline ${index + 1}`);
    if (!option.shape || bonus.picked) kids.push(caption);
    const button = el('button', {
      type: 'button',
      class: `shape-btn${bonus.picked && option.correct ? ' correct' : ''}${bonus.picked && option.id === bonus.picked && !option.correct ? ' wrong' : ''}`,
      disabled: bonus.picked ? true : null,
      'aria-label': option.shape && !bonus.picked ? `Outline ${index + 1}` : caption,
      onclick: () => pickBonus(option.id),
    }, kids);
    choices.append(button);
  });
  ui.bonus.append(choices);
  if (bonus.picked) {
    ui.bonus.append(el('button', { class: 'cont', type: 'button', onclick: continueBonus }, [bonusAt + 1 === queue.length ? 'See the round' : 'Continue']));
  }
  if (skips.length && bonusAt === 0) ui.bonus.append(el('p', { class: 'note' }, [skips.join(' ')]));
}
function commit() {
  if (phase !== 'guess') return;
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
  if (phase !== 'guess') return;
  if (rows.some(row => row.code === country.code)) {
    message = 'Already guessed.';
    messageBad = true;
    paint();
    return;
  }
  const found = country.code === answer.code;
  const km = found ? 0 : distance(country, answer);
  const dir = pointFrom(bearing(country, answer));
  rows.push({
    code: country.code,
    name: country.name,
    km,
    found,
    arrow: dir[3],
    dirShort: dir[2],
  });
  query = '';
  hi = 0;
  ui.input.value = '';
  messageBad = false;
  if (found) {
    message = `Solved in ${rows.length} ${rows.length === 1 ? 'guess' : 'guesses'}.`;
    stats.solved = (stats.solved || 0) + 1;
    saveStats();
    return openBonuses();
  }
  if (rows.length >= TRIES) {
    message = `The country is ${answer.name}.`;
    return openBonuses();
  }
  const left = TRIES - rows.length;
  message = `${country.name}: ${formatKm(km)}, ${dir[1]}. ${left} ${left === 1 ? 'guess' : 'guesses'} left.`;
  paint();
}
function openBonuses() {
  remember(answer.code);
  queue = [];
  if (answer.shape) {
    const options = shuffle([answer, ...distractors(answer, 3, country => country.shape)]).map(country => ({
      id: country.code,
      correct: country.code === answer.code,
      shape: country.shape,
    }));
    queue.push({ kind: 'shape', prompt: `Which outline is ${answer.name}?`, options, picked: null });
  }
  const seenCities = new Set([answer.capital]);
  if (answer.code === 'za') {
    seenCities.add('Cape Town');
    seenCities.add('Bloemfontein');
  }
  const cityCountries = distractors(answer, 3, country => {
    if (seenCities.has(country.capital)) return false;
    seenCities.add(country.capital);
    return true;
  });
  const cities = shuffle([answer, ...cityCountries]).map(country => ({
    id: country.code,
    label: country.capital,
    correct: country.code === answer.code,
  }));
  const capitalPrompt = answer.code === 'za'
    ? 'Which of these is the executive capital of South Africa?'
    : `What is the capital of ${answer.name}?`;
  queue.push({ kind: 'capital', prompt: capitalPrompt, options: cities, picked: null });
  if (answer.neighbors.length) {
    const neighbor = byCode.get(shuffle(answer.neighbors)[0]);
    const neighbourSet = new Set(answer.neighbors);
    const options = shuffle([neighbor, ...distractors(answer, 3, country => !neighbourSet.has(country.code))]).map(country => ({
      id: country.code,
      label: country.name,
      correct: country.code === neighbor.code,
    }));
    queue.push({
      kind: 'borders',
      prompt: `Which country shares a land border with ${answer.name}?`,
      options,
      picked: null,
    });
  }
  bonusAt = 0;
  bonus = queue[0];
  bonusRight = 0;
  bonusAsked = 0;
  phase = 'bonus';
  paint();
}
function pickBonus(id) {
  if (!bonus || bonus.picked) return;
  bonus.picked = id;
  bonusAsked += 1;
  if (bonus.options.some(option => option.correct && option.id === id)) bonusRight += 1;
  paint();
}
function continueBonus() {
  if (bonusAt + 1 >= queue.length) {
    phase = 'done';
    message = message.replace(/\s*Bonus rounds use the same country\.$/, '');
    if (!message.includes('Bonus')) message = `${message} Bonus: ${bonusRight} of ${bonusAsked}.`;
    paint();
    return;
  }
  bonusAt += 1;
  bonus = queue[bonusAt];
  paint();
}
function nextCountry() {
  answer = pickAnswer();
  rows = [];
  queue = [];
  bonus = null;
  query = '';
  hi = 0;
  phase = 'guess';
  message = 'A new flag. Six guesses.';
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
    byCode = new Map(countries.map(country => [country.code, country]));
    answer = pickAnswer();
    phase = 'guess';
    message = 'Name the country on the flag. You have six guesses.';
    paint();
  } catch {
    message = 'The country list did not load.';
    messageBad = true;
    paint();
    app.querySelector('.screen').append(el('button', { class: 'next', type: 'button', onclick: () => location.reload() }, ['Try again']));
  }
}
boot();

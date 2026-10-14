// Folio: unlimited 5-letter guesses. Own palette (blue / apricot / slate), not a green-and-yellow clone.
const DISCLAIMER = 'Unofficial game. Not affiliated with The New York Times or Wordle.';
const ROWS = 6;
const LEN = 5;
const KEY_ROWS = [
  'qwertyuiop'.split(''),
  'asdfghjkl'.split(''),
  ['Enter', ...'zxcvbnm'.split(''), 'Del'],
];
const STORE = 'dlehq-folio';
const RANK = { absent: 1, present: 2, correct: 3 };

const app = document.getElementById('app');
let words = null;
let answer = '';
let grid = [];
let current = '';
let phase = 'load';
let message = 'Loading the word list…';
let messageBad = false;
let shake = false;
let keys = {};
let stats = loadStats();

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

function scoreGuess(guess, target) {
  const marks = Array(LEN).fill('absent');
  const left = {};
  for (let i = 0; i < LEN; i++) {
    if (guess[i] === target[i]) marks[i] = 'correct';
    else left[target[i]] = (left[target[i]] || 0) + 1;
  }
  for (let i = 0; i < LEN; i++) {
    if (marks[i] === 'correct') continue;
    if (left[guess[i]]) {
      marks[i] = 'present';
      left[guess[i]] -= 1;
    }
  }
  return marks;
}

function paintKeys(guess, marks) {
  for (let i = 0; i < guess.length; i++) {
    const letter = guess[i];
    const next = marks[i];
    if ((RANK[next] || 0) > (RANK[keys[letter]] || 0)) keys[letter] = next;
  }
}

function pickAnswer() {
  const recent = new Set(stats.recent || []);
  let pool = words.answers.filter(word => !recent.has(word));
  if (pool.length < 40) pool = words.answers.slice();
  return pool[Math.floor(Math.random() * pool.length)];
}

function remember(word) {
  if (!word) return;
  const recent = stats.recent || [];
  if (recent[recent.length - 1] !== word) recent.push(word);
  stats.recent = recent.slice(-80);
  saveStats();
}

function newRound() {
  if (answer) remember(answer);
  answer = pickAnswer();
  grid = [];
  current = '';
  keys = {};
  phase = 'play';
  message = 'A new five-letter word. Six guesses.';
  messageBad = false;
  shake = false;
  render();
}

function endRound(won) {
  phase = 'end';
  stats.played = (stats.played || 0) + 1;
  if (won) {
    stats.wins = (stats.wins || 0) + 1;
    stats.streak = (stats.streak || 0) + 1;
    stats.best = Math.max(stats.best || 0, stats.streak);
    message = `Solved in ${grid.length} ${grid.length === 1 ? 'guess' : 'guesses'}.`;
    messageBad = false;
  } else {
    stats.streak = 0;
    message = `The word was ${answer.toUpperCase()}.`;
    messageBad = true;
  }
  remember(answer);
  saveStats();
  render();
}

function submit() {
  if (phase !== 'play') return;
  if (current.length < LEN) {
    message = 'Enter a five-letter word.';
    messageBad = true;
    shake = true;
    render();
    return;
  }
  if (!words.guesses.has(current)) {
    message = 'Not in the word list.';
    messageBad = true;
    shake = true;
    render();
    return;
  }
  if (grid.some(row => row.guess === current)) {
    message = 'Already guessed.';
    messageBad = true;
    shake = true;
    render();
    return;
  }
  const marks = scoreGuess(current, answer);
  grid.push({ guess: current, marks });
  paintKeys(current, marks);
  current = '';
  shake = false;
  message = '';
  messageBad = false;
  if (marks.every(mark => mark === 'correct')) return endRound(true);
  if (grid.length >= ROWS) return endRound(false);
  render();
}

function typeLetter(letter) {
  if (phase !== 'play' || current.length >= LEN) return;
  current += letter;
  message = '';
  messageBad = false;
  render();
}
function backspace() {
  if (phase !== 'play' || !current) return;
  current = current.slice(0, -1);
  render();
}

function shareText() {
  const lines = grid.map(row => row.marks.map(mark => (mark === 'correct' ? '#' : mark === 'present' ? '+' : '-')).join(''));
  const label = phase === 'end'
    ? `Folio ${grid.length}/${ROWS}`
    : 'Folio';
  return [
    label,
    ...lines,
    '# right spot, + wrong spot, - absent',
    DISCLAIMER,
  ].join('\n');
}

async function share() {
  const text = shareText();
  try {
    await navigator.clipboard.writeText(text);
    message = 'Result copied.';
    messageBad = false;
  } catch {
    message = text;
    messageBad = false;
  }
  render();
}

function tileLabel(letter, mark) {
  if (!letter) return 'empty';
  if (mark === 'correct') return `${letter}, right spot`;
  if (mark === 'present') return `${letter}, wrong spot`;
  if (mark === 'absent') return `${letter}, not in the word`;
  return letter;
}

function board() {
  const wrap = el('div', { class: 'board', role: 'grid', 'aria-label': 'Guesses' });
  for (let r = 0; r < ROWS; r++) {
    const row = grid[r];
    const live = !row && r === grid.length;
    const rowEl = el('div', { class: 'row' + (live && shake ? ' shake' : ''), role: 'row' });
    for (let c = 0; c < LEN; c++) {
      const letter = row ? row.guess[c] : (live ? current[c] || '' : '');
      const mark = row ? row.marks[c] : '';
      rowEl.append(el('div', {
        class: 'tile' + (letter ? ' filled' : '') + (mark ? ' ' + mark : ''),
        role: 'gridcell',
        'aria-label': tileLabel(letter, mark),
      }, [letter]));
    }
    wrap.append(rowEl);
  }
  return wrap;
}

function keyboard() {
  const wrap = el('div', { class: 'keys' });
  for (const row of KEY_ROWS) {
    const line = el('div', { class: 'krow' });
    for (const key of row) {
      const wide = key === 'Enter' || key === 'Del';
      const mark = key.length === 1 ? keys[key] : '';
      const button = el('button', {
        type: 'button',
        class: 'key' + (wide ? ' wide' : '') + (mark ? ' ' + mark : ''),
        'aria-label': key === 'Del' ? 'Backspace' : key,
      }, [key === 'Del' ? 'Del' : key]);
      button.addEventListener('click', () => {
        if (key === 'Enter') submit();
        else if (key === 'Del') backspace();
        else typeLetter(key);
      });
      line.append(button);
    }
    wrap.append(line);
  }
  return wrap;
}

function render() {
  if (shake) setTimeout(() => { shake = false; }, 360);
  app.classList.toggle('cb', !!stats.cb);
  app.replaceChildren();
  if (phase === 'load' || phase === 'error') {
    app.append(el('div', { class: 'screen center' }, [
      el('h1', { class: 'mark' }, ['Folio']),
      el('p', { class: 'legal' }, [DISCLAIMER]),
      el('p', { class: messageBad ? 'msg bad' : 'msg' }, [message]),
    ]));
    return;
  }
  const screen = el('div', { class: 'screen' });
  screen.append(el('div', { class: 'top' }, [
    el('div', {}, [
      el('h1', { class: 'mark' }, ['Fol', el('span', {}, ['io'])]),
      el('p', { class: 'sub' }, ['Five letters · unlimited rounds']),
    ]),
    el('div', { class: 'tools' }, [
      el('button', {
        type: 'button',
        'aria-pressed': stats.cb ? 'true' : 'false',
        onclick: () => { stats.cb = !stats.cb; saveStats(); render(); },
      }, [stats.cb ? 'Colorblind colors on' : 'Colorblind colors']),
      el('button', { type: 'button', onclick: newRound }, ['New word']),
    ]),
  ]));
  screen.append(el('p', { class: 'legal' }, [DISCLAIMER]));
  screen.append(el('div', { class: 'stats' }, [
    el('span', {}, ['Streak ', el('b', {}, [String(stats.streak || 0)])]),
    el('span', {}, ['Best ', el('b', {}, [String(stats.best || 0)])]),
    el('span', {}, ['Won ', el('b', {}, [`${stats.wins || 0}/${stats.played || 0}`])]),
  ]));
  screen.append(board());
  screen.append(el('p', { class: messageBad ? 'msg bad' : 'msg', role: 'status' }, [message]));
  if (stats.cb) screen.append(el('p', { class: 'legend' }, ['Solid blue with a white rim: right spot. Stripes: in the word, wrong spot. Slash: not in the word.']));
  if (phase === 'end') {
    screen.append(el('div', { class: 'actions' }, [
      el('button', { type: 'button', onclick: share }, ['Share result']),
      el('button', { type: 'button', onclick: newRound }, ['New word']),
    ]));
  }
  screen.append(keyboard());
  screen.append(el('p', { class: 'note' }, ['Type on your keyboard, or tap the keys. Word list: ENABLE1, public domain. 2,500 answers, 8,616 accepted guesses.']));
  app.append(screen);
}

window.addEventListener('keydown', event => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.key === 'Enter') { event.preventDefault(); submit(); }
  else if (event.key === 'Backspace') { event.preventDefault(); backspace(); }
  else if (/^[a-zA-Z]$/.test(event.key)) { event.preventDefault(); typeLetter(event.key.toLowerCase()); }
});

async function boot() {
  render();
  try {
    const res = await fetch('words.json');
    if (!res.ok) throw new Error('words');
    words = await res.json();
    if (!words.answers?.length || !words.guesses?.length) throw new Error('words');
    words.guesses = new Set(words.guesses);
    answer = pickAnswer();
    phase = 'play';
    message = 'A new five-letter word. Six guesses.';
    render();
  } catch {
    phase = 'error';
    message = 'The word list failed to load. Refresh the page.';
    messageBad = true;
    render();
  }
}

boot();

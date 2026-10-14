// One-off asset builder for the geography games. Not part of `node build.mjs`.
// Country facts: mledoze/countries (ODbL). Flags: flag-icons (MIT).
// Outlines: mapsicon by Régis Freyd, simplified to a small path.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const FLAG_DIR = path.join(ROOT, 'public/games/flagle/flags');
const COUNTRIES_URL = 'https://raw.githubusercontent.com/mledoze/countries/master/dist/countries-unescaped.json';
const FLAG_URL = code => `https://raw.githubusercontent.com/lipis/flag-icons/master/flags/4x3/${code}.svg`;
const MAP_URL = code => `https://raw.githubusercontent.com/djaiss/mapsicon/master/all/${code}/vector.svg`;

const EXTRA = {
  TR: ['Turkey'],
  CZ: ['Czech Republic'],
  MK: ['Macedonia'],
  SZ: ['Swaziland'],
  CV: ['Cape Verde'],
  TL: ['East Timor', 'Timor-Leste'],
  US: ['USA', 'United States of America'],
  GB: ['UK', 'Britain', 'Great Britain'],
  KR: ['South Korea'],
  KP: ['North Korea'],
  CI: ["Cote d'Ivoire", 'Ivory Coast'],
  CD: ['DRC', 'Democratic Republic of the Congo', 'Congo-Kinshasa'],
  CG: ['Republic of the Congo', 'Congo-Brazzaville'],
  NL: ['Holland', 'The Netherlands'],
  AE: ['UAE', 'United Arab Emirates'],
  VN: ['Vietnam'],
  LA: ['Laos'],
  MM: ['Burma'],
  FM: ['Micronesia'],
  BN: ['Brunei'],
  BO: ['Bolivia'],
  IR: ['Iran'],
  SY: ['Syria'],
  TZ: ['Tanzania'],
  MD: ['Moldova'],
  RU: ['Russia'],
  KG: ['Kyrgyzstan'],
  SK: ['Slovakia'],
  VA: ['Vatican'],
};

function latinAlias(value) {
  const text = String(value || '').trim();
  if (text.length < 2 || text.length > 48) return '';
  const plain = text.normalize('NFD').replace(/\p{M}/gu, '');
  if (!/^[A-Za-z0-9][A-Za-z0-9 .,'’()-]*$/.test(plain)) return '';
  return text;
}

const KEEP_SHORT = new Set(['US', 'UK', 'USA', 'UAE', 'DRC', 'RSA']);

function aliasesFor(country) {
  const found = new Map();
  const add = value => {
    const text = latinAlias(value);
    if (!text) return;
    if (text.length <= 3 && !KEEP_SHORT.has(text.toUpperCase())) return;
    const key = text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (!found.has(key)) found.set(key, text);
  };
  add(country.name.common);
  for (const item of country.altSpellings || []) add(item);
  for (const item of EXTRA[country.cca2] || []) add(item);
  return [...found.values()];
}

// The source list leaves the Singapore–Malaysia causeway unlisted. It is a land border.
const EXTRA_BORDERS = { sg: ['my'], my: ['sg'] };

function tokenize(d) {
  return d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) || [];
}

function cubic(p0, p1, p2, p3, steps) {
  const pts = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    const x = mt ** 3 * p0[0] + 3 * mt ** 2 * t * p1[0] + 3 * mt * t ** 2 * p2[0] + t ** 3 * p3[0];
    const y = mt ** 3 * p0[1] + 3 * mt ** 2 * t * p1[1] + 3 * mt * t ** 2 * p2[1] + t ** 3 * p3[1];
    pts.push([x, y]);
  }
  return pts;
}

function parseRings(d) {
  const tokens = tokenize(d);
  let i = 0;
  let cmd = '';
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  const rings = [];
  let ring = null;
  const num = () => parseFloat(tokens[i++]);
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
    if (cmd === 'M' || cmd === 'm') {
      const x = num();
      const y = num();
      if (cmd === 'm') { cx += x; cy += y; } else { cx = x; cy = y; }
      if (ring && ring.length) rings.push(ring);
      ring = [[cx, cy]];
      sx = cx;
      sy = cy;
      cmd = cmd === 'm' ? 'l' : 'L';
    } else if (cmd === 'L' || cmd === 'l') {
      const x = num();
      const y = num();
      if (cmd === 'l') { cx += x; cy += y; } else { cx = x; cy = y; }
      ring.push([cx, cy]);
    } else if (cmd === 'C' || cmd === 'c') {
      let x1 = num();
      let y1 = num();
      let x2 = num();
      let y2 = num();
      let x = num();
      let y = num();
      if (cmd === 'c') {
        x1 += cx; y1 += cy; x2 += cx; y2 += cy; x += cx; y += cy;
      }
      ring.push(...cubic([cx, cy], [x1, y1], [x2, y2], [x, y], 3));
      cx = x;
      cy = y;
    } else if (cmd === 'Z' || cmd === 'z') {
      if (ring) {
        ring.push([sx, sy]);
        rings.push(ring);
      }
      ring = null;
      cx = sx;
      cy = sy;
    } else if (cmd === 'H' || cmd === 'h' || cmd === 'V' || cmd === 'v') {
      const n = num();
      if (cmd === 'H') cx = n;
      else if (cmd === 'h') cx += n;
      else if (cmd === 'V') cy = n;
      else cy += n;
      ring.push([cx, cy]);
    } else {
      throw new Error('unsupported path command ' + cmd);
    }
  }
  if (ring && ring.length) rings.push(ring);
  return rings;
}

function simplify(points, minDist) {
  if (!points.length) return [];
  const out = [points[0]];
  for (const point of points) {
    const prev = out[out.length - 1];
    if (Math.hypot(point[0] - prev[0], point[1] - prev[1]) >= minDist) out.push(point);
  }
  return out;
}

function outlineFromSvg(svg) {
  const flat = svg.replace(/\s+/g, ' ');
  const paths = [...flat.matchAll(/\bd="([^"]+)"/g)].map(match => match[1]);
  if (!paths.length) return '';
  const raw = paths.flatMap(parseRings);
  const rings = raw.map(ring => ring.map(([x, y]) => [0.1 * x, 1024 - 0.1 * y]));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (const [x, y] of ring) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  const width = maxX - minX || 1;
  const height = maxY - minY || 1;
  const scale = 88 / Math.max(width, height);
  const ox = (100 - width * scale) / 2;
  const oy = (100 - height * scale) / 2;
  let d = '';
  for (const ring of rings) {
    const mapped = ring.map(([x, y]) => [ox + (x - minX) * scale, oy + (y - minY) * scale]);
    const simple = simplify(mapped, 1.4);
    if (simple.length < 4) continue;
    d += `M${simple.map(([x, y]) => `${Math.round(x)} ${Math.round(y)}`).join('L')}Z`;
  }
  return d;
}

async function getText(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(url);
    if (response.ok) return response.text();
    if (response.status === 404) return '';
    await new Promise(resolve => setTimeout(resolve, 400 * (attempt + 1)));
  }
  throw new Error('failed ' + url);
}

async function pool(items, limit, worker) {
  const queue = items.slice();
  await Promise.all(Array.from({ length: limit }, async () => {
    while (queue.length) await worker(queue.shift());
  }));
}

const raw = JSON.parse(await getText(COUNTRIES_URL));
const independent = raw.filter(country => country.independent && country.capital?.length && country.latlng?.length === 2);
const by3 = new Map(independent.map(country => [country.cca3, country.cca2.toLowerCase()]));

fs.mkdirSync(FLAG_DIR, { recursive: true });
const records = [];
const missingFlags = [];
const missingShapes = [];

await pool(independent, 8, async country => {
  const code = country.cca2.toLowerCase();
  const flagFile = path.join(FLAG_DIR, `${code}.svg`);
  let flag = fs.existsSync(flagFile) ? fs.readFileSync(flagFile, 'utf8') : '';
  if (!flag) {
    flag = await getText(FLAG_URL(code));
    if (!flag) {
      missingFlags.push(country.name.common);
      return;
    }
    fs.writeFileSync(flagFile, flag);
  }
  const mapSvg = await getText(MAP_URL(code));
  let shape = '';
  if (mapSvg) {
    try { shape = outlineFromSvg(mapSvg); }
    catch (error) { console.error('shape', code, error.message); }
  }
  if (!shape) missingShapes.push(`${country.name.common} (${code})`);
  records.push({
    code,
    name: country.name.common,
    lat: country.latlng[0],
    lon: country.latlng[1],
    capital: country.capital[0],
    region: country.region,
    subregion: country.subregion || country.region,
    neighbors: (country.borders || []).map(item => by3.get(item)).filter(Boolean).sort(),
    aliases: aliasesFor(country),
    shape,
  });
});

records.sort((a, b) => a.name.localeCompare(b.name));
const playable = new Set(records.map(country => country.code));
for (const country of records) {
  const extra = EXTRA_BORDERS[country.code] || [];
  country.neighbors = [...new Set([...country.neighbors, ...extra])].filter(code => playable.has(code) && code !== country.code).sort();
}

const bare = records.map(({ shape, ...country }) => country);
fs.mkdirSync(path.join(ROOT, 'public/games/globle'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'public/games/globle/countries.json'), JSON.stringify(bare));
fs.writeFileSync(path.join(ROOT, 'public/games/flagle/countries.json'), JSON.stringify(records));

const notice = `Country names, capitals, centre points, regions, and land borders in countries.json are derived from the mledoze/countries database (https://github.com/mledoze/countries), © mledoze and contributors, licensed under the Open Database License (ODbL) v1.0: https://opendatacommons.org/licenses/odbl/1.0/

countries.json is a derivative database and is offered under the same ODbL terms. Flags are not part of that database.
`;
fs.writeFileSync(path.join(ROOT, 'public/games/globle/COUNTRIES-ODbL.txt'), notice);
fs.writeFileSync(path.join(ROOT, 'public/games/flagle/COUNTRIES-ODbL.txt'), notice);

const flagLicense = await getText('https://raw.githubusercontent.com/lipis/flag-icons/master/LICENSE');
fs.writeFileSync(path.join(ROOT, 'public/games/flagle/FLAG-LICENSE.txt'),
  `The flag SVGs in flags/ are from flag-icons (https://github.com/lipis/flag-icons), © 2013 Panayiotis Lipiridis, MIT License.\n\n${flagLicense}\n`);
fs.writeFileSync(path.join(ROOT, 'public/games/flagle/OUTLINE-CREDIT.txt'),
  `Country outline paths in countries.json were simplified from mapsicon vector icons by Régis Freyd (https://github.com/djaiss/mapsicon).\n\nThe mapsicon README says: do what you want with them as long as you mention the author, and do not resell the icons. DLE HQ uses the simplified silhouettes inside a free browser game and credits Régis Freyd here and on the Bunting board.\n`);

const shaped = records.filter(country => country.shape).length;
const islands = records.filter(country => country.neighbors.length === 0).map(country => country.name);
const bytes = fs.statSync(path.join(ROOT, 'public/games/flagle/countries.json')).size;
console.log(`countries ${records.length}, shapes ${shaped}, flag json ${bytes} bytes`);
console.log('missing flags:', missingFlags.join(', ') || '(none)');
console.log('missing shapes:', missingShapes.join(', ') || '(none)');
console.log('no land neighbour:', islands.join(', '));

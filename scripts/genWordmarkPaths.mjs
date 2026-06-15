/**
 * genWordmarkPaths.mjs
 * Build-time script: parse EMS Allure SVG font and emit wordmarkPaths.js
 * for the HandwrittenWordmark component.
 *
 * Run: node scripts/genWordmarkPaths.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── 1. Read the SVG font ──────────────────────────────────────────────────────
const svgRaw = readFileSync(join(__dirname, 'EMSAllure.svg'), 'utf8');

// ── 2. Font metrics (from <font-face>) ───────────────────────────────────────
const UNITS_PER_EM = 1000;
const ASCENT = 800;
const DEFAULT_HADV = 378;

// ── 3. Parse all glyphs ───────────────────────────────────────────────────────
// Match each <glyph unicode="X" ... d="..." /> element
const glyphRe = /<glyph([^>]*)\/>/g;
const attrRe = (name) => new RegExp(`${name}="([^"]*)"`, 'i');

const glyphMap = {}; // char -> { hadvx, d }

let m;
while ((m = glyphRe.exec(svgRaw)) !== null) {
  const attrs = m[1];
  const uniMatch = attrRe('unicode').exec(attrs);
  const dMatch = attrRe(' d').exec(attrs);
  const hadvMatch = attrRe('horiz-adv-x').exec(attrs);

  if (!uniMatch) continue;

  // Decode unicode entity if needed (e.g. &#x41; -> 'A')
  let char = uniMatch[1];
  const entityMatch = /^&#x([0-9a-fA-F]+);$/.exec(char);
  if (entityMatch) char = String.fromCodePoint(parseInt(entityMatch[1], 16));
  const ampMatch = /^&amp;$/.exec(char);
  if (ampMatch) char = '&';

  glyphMap[char] = {
    hadvx: hadvMatch ? parseFloat(hadvMatch[1]) : DEFAULT_HADV,
    d: dMatch ? dMatch[1].trim() : null,
  };
}

// ── 4. Tokenize a glyph `d` string into commands ─────────────────────────────
function tokenizeD(d) {
  // Returns array of { cmd: 'M'|'L'|'C'|'Q'|'Z', nums: [...] }
  const tokens = [];
  const re = /([MLCQZmlcqz])([^MLCQZmlcqz]*)/g;
  let t;
  while ((t = re.exec(d)) !== null) {
    const cmd = t[1].toUpperCase();
    const rawNums = t[2].trim();
    const nums = rawNums.length
      ? rawNums.split(/[\s,]+/).filter(Boolean).map(Number)
      : [];
    tokens.push({ cmd, nums });
  }
  return tokens;
}

// ── 5. Transform glyph path: translate X by penX, flip Y (ascent - y) ────────
function transformD(d, penX) {
  const tokens = tokenizeD(d);
  const parts = [];
  for (const { cmd, nums } of tokens) {
    if (cmd === 'Z') {
      parts.push('Z');
      continue;
    }
    // Determine coordinate pair count per command
    let pairCount;
    if (cmd === 'M' || cmd === 'L') pairCount = 1;
    else if (cmd === 'C') pairCount = 3; // cubic: 3 pairs
    else if (cmd === 'Q') pairCount = 2; // quadratic: 2 pairs
    else pairCount = 1; // fallback

    const pointsPerCmd = pairCount * 2; // number of nums consumed per "sub-command"
    const transformed = [];
    for (let i = 0; i < nums.length; i += pointsPerCmd) {
      const ptNums = nums.slice(i, i + pointsPerCmd);
      const tPts = [];
      for (let j = 0; j < ptNums.length; j += 2) {
        const x = ptNums[j] + penX;
        const y = ASCENT - ptNums[j + 1]; // Y-flip
        tPts.push(`${+x.toFixed(3)},${+y.toFixed(3)}`);
      }
      transformed.push(tPts.join(' '));
    }
    parts.push(`${cmd} ${transformed.join(' ')}`);
  }
  return parts.join(' ');
}

// Compute polyline length from transformed d (M/L only, approximate for C/Q)
function polylineLength(d) {
  const tokens = tokenizeD(d);
  let len = 0;
  let lastX = 0, lastY = 0;
  for (const { cmd, nums } of tokens) {
    if (cmd === 'M') {
      for (let i = 0; i < nums.length; i += 2) {
        lastX = nums[i]; lastY = nums[i + 1];
      }
    } else if (cmd === 'L' || cmd === 'C' || cmd === 'Q') {
      // For C/Q use only the final point
      const pairCount = cmd === 'C' ? 3 : cmd === 'Q' ? 2 : 1;
      const step = pairCount * 2;
      for (let i = 0; i < nums.length; i += step) {
        const dx = nums[i + step - 2] - lastX;
        const dy = nums[i + step - 1] - lastY;
        len += Math.sqrt(dx * dx + dy * dy);
        lastX = nums[i + step - 2];
        lastY = nums[i + step - 1];
      }
    }
  }
  return len;
}

// ── 6. Lay out "PocketCache" ──────────────────────────────────────────────────
const WORD = 'PocketCache';
const letters = [];
let penX = 0;
let overallMinX = Infinity, overallMinY = Infinity;
let overallMaxX = -Infinity, overallMaxY = -Infinity;

// Bounding box scan (after Y-flip)
function updateBB(d) {
  const re = /[-\d.]+/g;
  const tokens2 = tokenizeD(d);
  for (const { cmd, nums } of tokens2) {
    if (cmd === 'Z') continue;
    for (let i = 0; i < nums.length; i += 2) {
      const x = nums[i];
      const y = nums[i + 1];
      if (x < overallMinX) overallMinX = x;
      if (y < overallMinY) overallMinY = y;
      if (x > overallMaxX) overallMaxX = x;
      if (y > overallMaxY) overallMaxY = y;
    }
  }
}

for (const char of WORD) {
  const glyph = glyphMap[char];
  if (!glyph) {
    console.warn(`Glyph not found for char: "${char}"`);
    penX += DEFAULT_HADV;
    continue;
  }
  const { hadvx, d } = glyph;
  let transformedD = '';
  let approxLen = 0;
  if (d) {
    transformedD = transformD(d, penX);
    approxLen = Math.round(polylineLength(d));
    updateBB(transformedD);
  }
  letters.push({ char, d: transformedD, length: approxLen });
  penX += hadvx;
}

// ── 7. Compute viewBox with padding ──────────────────────────────────────────
const PAD = 80; // ≥ STROKE_WIDTH/2 (100/2=50) plus margin, prevents stroke edge clipping
const vbX = Math.floor(overallMinX - PAD);
const vbY = Math.floor(overallMinY - PAD);
const vbW = Math.ceil(overallMaxX - overallMinX + PAD * 2);
const vbH = Math.ceil(overallMaxY - overallMinY + PAD * 2);
const VIEWBOX = `${vbX} ${vbY} ${vbW} ${vbH}`;

console.log('Letters found:', letters.map(l => l.char).join(''));
console.log('ViewBox:', VIEWBOX);
console.log('Letter count:', letters.length);

// ── 8. Emit wordmarkPaths.js ──────────────────────────────────────────────────
const outPath = join(ROOT, 'src/components/wordmarkPaths.js');
const letterJSON = letters
  .map(l => `  { char: ${JSON.stringify(l.char)}, d: ${JSON.stringify(l.d)}, length: ${l.length} }`)
  .join(',\n');

const output = `// AUTO-GENERATED — do not edit by hand.
// Generated by scripts/genWordmarkPaths.mjs from EMS Allure (SIL OFL).
// Run: node scripts/genWordmarkPaths.mjs

export const LETTERS = [
${letterJSON}
];

export const VIEWBOX = "${VIEWBOX}";

export const META = { unitsPerEm: ${UNITS_PER_EM}, ascent: ${ASCENT} };
`;

writeFileSync(outPath, output, 'utf8');
console.log(`Written: ${outPath}`);

/**
 * Contrast audit — parse popup/popup.css, extract color pairs, verify WCAG AA.
 *
 * WCAG AA: 4.5:1 for normal text, 3:1 for large text (18px+ bold or 24px+).
 * We flag anything below 4.5:1 as a fail; below 3:1 is critical.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cssPath = path.join(__dirname, '../popup/popup.css');

// ── Color parsing ────────────────────────────────────────────────────────────

// Extract :root CSS variables
const varMatch = css.match(/:root\s*\{([^}]+)\}/);
const CSS_VAR_MAP = {};
if (varMatch) {
  const vars = varMatch[1].split(';');
  for (const v of vars) {
    const [name, val] = v.split(':');
    if (name && val) {
      CSS_VAR_MAP[name.trim()] = val.trim();
    }
  }
}

function resolveColor(value) {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.startsWith('var(')) {
    const varName = trimmed.slice(4, -1).trim();
    return CSS_VAR_MAP[varName] || null;
  }
  if (trimmed.startsWith('#')) {
    return trimmed.toLowerCase();
  }
  return null;
}

function hexToRgb(hex) {
  if (!hex) return null;
  const h = hex.replace('#', '');
  if (h.length === 3) {
    return {
      r: parseInt(h[0] + h[0], 16),
      g: parseInt(h[1] + h[1], 16),
      b: parseInt(h[2] + h[2], 16),
    };
  }
  if (h.length === 6) {
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }
  return null;
}

function relLuminance({ r, g, b }) {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(hex1, hex2) {
  const rgb1 = hexToRgb(hex1);
  const rgb2 = hexToRgb(hex2);
  if (!rgb1 || !rgb2) return null;
  const l1 = relLuminance(rgb1);
  const l2 = relLuminance(rgb2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ── CSS parsing ──────────────────────────────────────────────────────────────

const css = await readFile(cssPath, 'utf8');

// Extract rule blocks: selector { declarations }
const ruleRegex = /([^{}]+)\{([^{}]+)\}/g;
const rules = [];
let match;
while ((match = ruleRegex.exec(css)) !== null) {
  const selector = match[1].trim();
  const body = match[2];
  if (!selector.startsWith('@')) {
    rules.push({ selector, body });
  }
}

// For each rule, extract color and background declarations
const pairs = [];
for (const rule of rules) {
  const colorMatch = rule.body.match(/(?:^|;|\s)color:\s*([^;]+);/);
  const bgMatch = rule.body.match(/(?:^|;|\s)background(?:-color)?:\s*([^;]+);/);

  if (colorMatch) {
    const fg = resolveColor(colorMatch[1]);
    const bg = bgMatch ? resolveColor(bgMatch[1]) : '#0b0f19'; // default to --bg
    if (fg && bg) {
      pairs.push({ selector: rule.selector, fg, bg });
    }
  }
}

// ── Audit ────────────────────────────────────────────────────────────────────

const fails = [];
const passes = [];

for (const { selector, fg, bg } of pairs) {
  const ratio = contrastRatio(fg, bg);
  if (ratio === null) continue;

  const entry = { selector, fg, bg, ratio: ratio.toFixed(2) };

  if (ratio < 3) {
    fails.push({ ...entry, severity: 'critical' });
  } else if (ratio < 4.5) {
    fails.push({ ...entry, severity: 'fail' });
  } else {
    passes.push(entry);
  }
}

// ── Report ───────────────────────────────────────────────────────────────────

console.log(`\nContrast audit: ${passes.length} pass, ${fails.length} fail\n`);

if (fails.length > 0) {
  console.log('FAILS (WCAG AA):');
  for (const f of fails.sort((a, b) => parseFloat(a.ratio) - parseFloat(b.ratio))) {
    console.log(`  [${f.severity}] ${f.ratio}:1  ${f.selector}  (${f.fg} on ${f.bg})`);
  }
}

// ── Assertions ───────────────────────────────────────────────────────────────

assert.equal(
  fails.length,
  0,
  `Found ${fails.length} WCAG AA contrast failures (ratio < 4.5:1):\n` +
    fails.map((f) => `  [${f.severity}] ${f.selector}: ${f.ratio}:1`).join('\n')
);

console.log('\n✓ No critical contrast failures.');

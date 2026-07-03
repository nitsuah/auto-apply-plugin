/**
 * content/utils.js - Shared utilities for content script
 * Extracted from content.js (lines 1-41, 504-532)
 */

/** Draft storage key used across modules */
export const DRAFT_STORAGE_KEY = 'applicationDrafts';

/** Check if Chrome extension context is still valid */
export function hasExtensionContext() {
  return !!(globalThis.chrome?.runtime?.id && globalThis.chrome?.storage?.local);
}

/** Check if error is due to extension context being invalidated */
export function isExtensionContextInvalidatedError(error) {
  const message = error?.message || String(error || '');
  return /Extension context invalidated/i.test(message);
}

/** Log warning only when it's actually relevant (skip invalidated errors) */
export function warnIfRelevant(prefix, error) {
  if (isExtensionContextInvalidatedError(error)) return;
  console.warn(prefix, error);
}

/**
 * Check if a hostname matches a domain or any of its subdomains.
 * @param {string} hostname
 * @param {string} domain
 * @returns {boolean}
 */
export function matchesDomain(hostname, domain) {
  return hostname === domain || hostname.endsWith('.' + domain);
}

/** Query selector shorthand */
export function qs(selector) {
  try { return document.querySelector(selector); } catch { return null; }
}

/** Return the first non-empty text value from a list of values */
export function firstNonEmptyText(...values) {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return '';
}

/** Extract generic text from the page for job descriptions */
export function extractGenericText() {
  const JD_KEYWORDS = ['responsibilities', 'qualifications', 'requirements', 'experience', 'skills', 'about', 'role', 'position'];
  const candidates = Array.from(document.querySelectorAll(
    'article, section, main, .job-description, [class*="description"], [id*="description"], [class*="posting"], [id*="posting"]'
  ));
  let best = null;
  let bestScore = 0;
  for (const el of candidates) {
    const text = el.innerText || '';
    if (text.length < 200) continue;
    const lower = text.toLowerCase();
    const kwHits = JD_KEYWORDS.filter((kw) => lower.includes(kw)).length;
    const score = kwHits * 100 + text.length;
    if (score > bestScore) { bestScore = score; best = text; }
  }
  return best || document.body.innerText.slice(0, 8000);
}
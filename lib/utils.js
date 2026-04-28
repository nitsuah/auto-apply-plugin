// Caveman add missing stubs for popup.js imports
export function setBadgeState() {}
export function setStatusRowMeta() {}
export function getAtsMeta() { return {}; }
export function getAtsHint() { return ''; }
export function normalizeTrackingStatus(x) { return x; }
/**
 * Return CSS class for badge tone
 */
export function badgeToneClass(tone) {
  switch (tone) {
    case 'success': return 'badge-success';
    case 'error': return 'badge-error';
    case 'warning': return 'badge-warning';
    case 'info':
    default: return 'badge-info';
  }
}
// Utility functions for DOM, escaping, and general helpers

/**
 * Format a date string or Date object as YYYY-MM-DD (or fallback to locale if invalid).
 * @param {string|Date|number} value
 * @returns {string}
 */
export function formatDate(value) {
  if (!value) return '';
  const d = (value instanceof Date) ? value : new Date(value);
  if (isNaN(d)) return '';
  // Pad to 2 digits
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Shorthand for document.getElementById
 */
export function $(id) {
  return document.getElementById(id);
}

/**
 * Escape HTML for text content
 */
export function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Escape HTML for attribute values
 */
export function escAttr(str) {
  return esc(str).replace(/'/g, '&#39;');
}

/**
 * Truncate text to a max length, adding ellipsis if needed
 */
export function truncateText(text, maxLength = 96) {
  const value = String(text || '').trim();
  if (value.length <= maxLength) return value;
  return value.slice(0, Math.max(0, maxLength - 1)).trimEnd() + '…';
}

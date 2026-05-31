// a11y.js
// Lightweight accessibility helpers. Many popup inputs rely on a placeholder
// for their visible hint but have no associated <label>, which leaves screen
// readers without an accessible name. This derives a name from the placeholder
// (or title, or a select's first option) so every control is announced.

/**
 * @param {Element|Document} [root]
 */
export function applyAccessibleNames(root = document) {
  const controls = root.querySelectorAll('input:not([type="hidden"]), textarea, select');
  controls.forEach((el) => {
    if (hasAccessibleName(el)) return;

    let name = el.getAttribute('placeholder') || el.getAttribute('title') || '';
    if (!name && el.tagName === 'SELECT') {
      const firstOption = el.querySelector('option');
      name = (firstOption?.textContent || '').replace(/[…:\s]+$/, '').trim();
    }
    if (name) el.setAttribute('aria-label', name);
  });
}

function hasAccessibleName(el) {
  if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) return true;
  if (el.id) {
    try {
      if (el.ownerDocument.querySelector(`label[for="${CSS.escape(el.id)}"]`)) return true;
    } catch {
      // Invalid selector — fall through.
    }
  }
  // A wrapping <label> (e.g. checkbox rows, tracker field labels) names the control.
  if (el.closest('label')) return true;
  return false;
}

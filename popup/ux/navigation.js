// navigation.js
// Handles navigation, screen switching, and section scrolling

// Show a named screen and hide others
export function showScreen(name) {
  for (const el of document.querySelectorAll('.screen')) {
    el.classList.add('hidden');
  }
  const target = document.getElementById(name + '-screen');
  if (target) target.classList.remove('hidden');
  document.body.dataset.screen = name;
}

// Make Apply Bot icon button go home
if (typeof window !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    const homeBtn = document.getElementById('header-home-btn');
    if (homeBtn) homeBtn.onclick = () => showScreen('main');
  });
}

export function scrollToSection(sectionId) {
  if (!sectionId) return;
  requestAnimationFrame(() => {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

export function bindReviewJumpHandlers(listId, statusId = 'fill-status') {
  const list = document.getElementById(listId);
  if (!list || list.dataset.jumpBound === 'true') return;
  list.dataset.jumpBound = 'true';

  list.addEventListener('click', async (event) => {
    const btn = event.target.closest('.review-jump-btn');
    if (!btn) return;

    let payload = { label: btn.textContent.trim() };
    try {
      payload = JSON.parse(decodeURIComponent(btn.dataset.payload || ''));
    } catch {
      // fallback to label only
    }

    try {
      // This requires sendToActiveTab and setStatus to be globally available or imported
      const resp = await window.sendToActiveTab({ type: 'FOCUS_FIELD', payload });
      if (!resp?.success) throw new Error(resp?.error || 'Could not find that field on the page.');
      window.setStatus?.(statusId, `✅ Jumped to “${resp.label || payload.label}” on the page.`, 'success');
      window.close();
    } catch (err) {
      window.setStatus?.(statusId, '❌ ' + err.message, 'error');
    }
  });
}

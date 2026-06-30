/**
 * content/message-listener.js - Chrome runtime message handling for content script
 * Extracted from content.js (lines ~43-89)
 */

export function setupMessageListener() {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!frameOwnsMessage(msg)) return false;
    handleMessage(msg, sendResponse).then((result) => {
      if (result !== undefined) sendResponse(result);
    }).catch((err) => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  });
}

async function handleMessage(msg, sendResponse) {
  switch (msg.type) {
    case 'FILL_FORM':
      return handleFillForm();
    case 'INJECT_ANSWERS':
      return handleInjectAnswers(msg.payload);
    case 'GET_JOB_INFO':
      return handleGetJobInfo();
    case 'DETECT_ATS':
      return { ats: detectAts() };
    case 'FOCUS_FIELD':
      return handleFocusField(msg.payload);
    case 'FETCH_LINKEDIN_JOBS': {
      const { query, csrfToken } = msg.payload || {};
      const params = new URLSearchParams({
        keywords: query || '',
        start: '0',
        count: '25',
        origin: 'GLOBAL_SEARCH_HEADER',
        q: 'all',
      });
      const res = await fetch(`${window.location.origin}/voyager/api/jobs/search?${params}`, {
        headers: {
          'Csrf-Token': csrfToken || '',
          'X-Restli-Protocol-Version': '2.0.0',
          'Accept': 'application/vnd.linkedin.normalized+json+2.1',
        },
      });
      if (!res.ok) {
        sendResponse({ success: false, error: `LinkedIn responded ${res.status}` });
        return;
      }
      const data = await res.json();
      sendResponse({ success: true, data });
      return;
    }
    default:
      throw new Error('Unknown message: ' + msg.type);
  }
}

// Helper functions (extracted from content.js)

function frameOwnsMessage(msg) {
  const IS_TOP_FRAME = (() => { try { return window.top === window; } catch { return false; } )();
  switch (msg?.type) {
    case 'FILL_FORM':
    case 'INJECT_ANSWERS':
      return getFillableInputs().length > 0;
    case 'FOCUS_FIELD':
      return !!findFieldForReviewTarget(msg.payload || {});
    case 'GET_JOB_INFO':
    case 'DETECT_ATS':
    case 'FETCH_LINKEDIN_JOBS':
      return IS_TOP_FRAME;
    default:
      return IS_TOP_FRAME;
  }
}
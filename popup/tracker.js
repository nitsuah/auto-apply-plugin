// tracker-new.js
// Orchestrator for tracker board logic, imports all split modules

import {
  TRACKER_STATUS_META,
  TRACKER_STATUS_ORDER,
  getTrackingStatusMeta
} from './tracker-meta.js';
import {
  expandedTrackerIds,
  trackerViewState,
  trackerDragState,
  trackerSaveTimers
} from './tracker-state.js';
import {
  renderTracker,
  renderTrackerLane,
  renderTrackerCard
} from './tracker-ui.js';
import {
  initTrackerHandlers,
  handleTrackerDragStart,
  handleTrackerDrop
} from './tracker-handlers.js';
import {
  exportCsv,
  importTrackerCsvFile
} from './tracker-csv.js';

// --- Core tracker orchestrator logic ---

import { $, esc, escAttr, truncateText, setBadgeState, setStatusRowMeta } from '../lib/utils.js';
import { showScreen } from './ux/navigation.js';

export async function trackerSendMessage(msg) {
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(msg, (response) => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve(response);
      });
    });
  }
  return {};
}

export function isStandaloneView() {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('standalone') === '1';
}

export function canOpenExpandedWorkspace() {
  return typeof chrome !== 'undefined' && !!chrome.runtime?.id && typeof window !== 'undefined' && window.location.protocol !== 'file:';
}

export function buildExpandedWorkspaceUrl(screen, sectionId = '') {
  const url = new URL(chrome.runtime.getURL('popup/popup.html'));
  url.searchParams.set('screen', screen);
  url.searchParams.set('standalone', '1');
  if (sectionId) {
    url.searchParams.set('section', sectionId);
  }
  return url.toString();
}

export async function openExpandedWorkspace(screen, sectionId = '') {
  if (!canOpenExpandedWorkspace()) return false;
  try {
    const url = buildExpandedWorkspaceUrl(screen, sectionId);
    const baseUrl = chrome.runtime.getURL('popup/popup.html');
    const tabs = await chrome.tabs.query({});
    const existing = tabs.find((tab) => {
      if (!tab?.id || !tab.url || !tab.url.startsWith(baseUrl)) return false;
      try {
        const tabUrl = new URL(tab.url);
        return tabUrl.searchParams.get('screen') === screen;
      } catch {
        return false;
      }
    });

    if (existing?.id) {
      await chrome.tabs.update(existing.id, { active: true, url });
      if (typeof existing.windowId === 'number') {
        await chrome.windows.update(existing.windowId, { focused: true });
      }
    } else {
      await chrome.tabs.create({ url, active: true });
    }

    if (typeof window !== 'undefined') window.close();
    return true;
  } catch {
    return false;
  }
}

// --- Barrel exports for all split modules ---

export {
  renderTracker,
  renderTrackerLane,
  renderTrackerCard,
  expandedTrackerIds,
  trackerDragState,
  trackerSaveTimers,
  trackerViewState,
  TRACKER_STATUS_META,
  TRACKER_STATUS_ORDER,
  getTrackingStatusMeta,
  initTrackerHandlers,
  handleTrackerDragStart,
  handleTrackerDrop,
  exportCsv,
  importTrackerCsvFile,
};

// All tracker board orchestration logic should be added to new files in popup/tracker/

// ats.js
// Handles ATS detection from state and popup UI helpers.
// ATS is detected by the content script and stored in state as currentAts.
// We use the pure getAtsMeta() from lib/utils.js to interpret it.

import { getAtsMeta as getAtsMetaPure } from '../../lib/utils.js';

/**
 * Get ATS info from the state's currentAts field.
 * Returns { label, hint, tone, tip } for UI.
 *
 * @param {string} [currentAts] — the ATS key from GET_STATE
 */
export function getAtsMeta(currentAts) {
  return getAtsMetaPure(currentAts);
}

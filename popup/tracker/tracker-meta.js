// tracker-meta.js
// Tracker status constants and meta

export const TRACKER_STATUS_META = {
  drafted: {
    label: 'Drafted',
    emoji: '🟡',
    optionHint: 'saved lead / not sent',
    cardHint: 'Saved lead — tailor before sending',
  },
  retired: {
    label: 'Retired',
    emoji: '⬜',
    optionHint: 'job unlisted / no reply',
    cardHint: 'Job closed or unlisted — not an explicit rejection',
    tone: 'grey',
  },
  submitted: {
    label: 'Submitted',
    emoji: '✅',
    optionHint: 'application sent',
    cardHint: 'Application is out the door',
  },
  pending: {
    label: 'Pending',
    emoji: '⏳',
    optionHint: 'Pending response / follow-up',
    cardHint: 'Recently submitted — awaiting response or follow-up timing',
  },
  interview: {
    label: 'Interview',
    emoji: '📅',
    optionHint: 'talking with the team',
    cardHint: 'Active conversations underway',
  },
  offer: {
    label: 'Offer',
    emoji: '🎉',
    optionHint: 'final stage / decision time',
    cardHint: 'Strong signal — decision stage',
  },
  rejected: {
    label: 'Rejected',
    emoji: '❌',
    optionHint: 'closed out / archived',
    cardHint: 'Closed out locally for reference',
  },
};

export const TRACKER_STATUS_ORDER = ['drafted', 'submitted', 'pending', 'interview', 'offer', 'rejected', 'retired'];

import { normalizeApplicationStatus } from '../../lib/tracker.js';

export function getTrackingStatusMeta(status) {
  const normalized = normalizeApplicationStatus(status);
  return {
    key: normalized,
    ...(TRACKER_STATUS_META[normalized] || TRACKER_STATUS_META.drafted),
  };
}

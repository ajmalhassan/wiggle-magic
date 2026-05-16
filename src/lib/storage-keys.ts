// src/lib/storage-keys.ts

/**
 * Single source of truth for chrome.storage keys.
 *
 * Naming conventions in this codebase are historical:
 * - Pre-rebuild keys use underscores (`wm_memory`, `wm_settings`, `wm_welcomed`)
 *   and live in chrome.storage.local OR sync (popup vs options).
 * - New keys (Plan 1+) use colon-namespaced prefixes (`wm:thread:`, `wm:actions:`)
 *   and live in chrome.storage.local.
 *
 * Don't reshape the legacy keys — popup/options rely on them.
 */
export const KEYS = {
  // Legacy keys, chrome.storage.local
  memory:       'wm_memory',
  firstRun:     'wm:first-run',          // content-script coachmark; local

  // Legacy keys, chrome.storage.sync
  settings:     'wm_settings',           // sync — cross-device
  welcomed:     'wm_welcomed',           // sync — cross-device

  // Plan 1 actions registry, chrome.storage.local
  actionsUser:           'wm:actions:user',
  actionsHero:           'wm:actions:hero',
  actionsHidden:         'wm:actions:hidden',
  actionsEnabledLibrary: 'wm:actions:enabled-library',

  // Plan 1 thread store, chrome.storage.local
  threadPrefix:         'wm:thread:',
  threadIndex:          'wm:thread-index',
  threadArchivePrefix:  'wm:thread-archive:',

  // Plan 2 sidebar width, chrome.storage.local
  sidebarWidthPrefix:   'wm:sidebar-width:',
} as const;

/**
 * background.js — Service worker that manages state and injects content scripts.
 *
 * - Maintains a per-tab log of captured API calls.
 * - Persists logs in chrome.storage.session so they survive service worker restarts.
 * - Injects content scripts on tab navigation.
 * - Provides the log data to the DevTools panel and popup on request.
 * - Deduplicates entries by ID to prevent double-logging.
 */
'use strict';

// ── Storage helpers ───────────────────────────────────────────────────
// chrome.storage.session survives service worker restarts but clears
// when the browser session ends — perfect for transient QA logs.

const STORAGE_KEY = 'tabLogs';

// ── Log Storage ───────────────────────────────────────────────────────

async function loadLogs() {
  const data = await chrome.storage.session.get(STORAGE_KEY);
  return data[STORAGE_KEY] || {};
}

async function saveLogs(logs) {
  await chrome.storage.session.set({ [STORAGE_KEY]: logs });
}

async function getTabLogs(tabId) {
  const all = await loadLogs();
  return all[String(tabId)] || [];
}

async function appendEntry(tabId, entry) {
  const all = await loadLogs();
  const key = String(tabId);
  if (!all[key]) all[key] = [];

  // Deduplicate by entry ID
  if (all[key].some((e) => e.id === entry.id)) return false;

  all[key].push(entry);
  await saveLogs(all);
  return true;
}

async function clearTabLogs(tabId) {
  const all = await loadLogs();
  delete all[String(tabId)];
  await saveLogs(all);
}

async function deleteTabFromStorage(tabId) {
  const all = await loadLogs();
  delete all[String(tabId)];
  await saveLogs(all);
}

// Raise the quota so large payloads don't get silently dropped.
// session storage allows up to ~10 MB; QUOTA_BYTES_PER_ITEM is 8192 by
// default but can be increased for session storage.
chrome.storage.session.setAccessLevel?.({
  accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS',
}).catch(() => {});

// ── Side panel configuration ──────────────────────────────────────────

if (chrome.sidePanel) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
}

// ── Content-script injection on navigation ────────────────────────────

chrome.webNavigation?.onCommitted.addListener(async (details) => {
  if (details.frameId !== 0) return;
  const url = details.url || '';
  if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('about:') || url.startsWith('devtools://')) return;

  try {
    await chrome.scripting.executeScript({
      target: { tabId: details.tabId },
      files: ['content.js'],
      injectImmediately: true,
    });
  } catch (e) {
    // Tab may have been closed or the URL isn't injectable
  }
});

async function ensureInjected(tabId) {
  try {
    const url = (await chrome.tabs.get(tabId))?.url || '';
    if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('about:') || url.startsWith('devtools://')) return;
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js'],
      injectImmediately: true,
    });
  } catch (e) {
    // Ignore
  }
}

// ── Message handling ──────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'apiLog' && sender.tab) {
    const tabId = sender.tab.id;
    appendEntry(tabId, msg.payload).then((added) => {
      if (added) {
        broadcastToPanel(tabId, { action: 'newEntry', payload: msg.payload });
        broadcastToPopup(tabId, { action: 'newEntry', payload: msg.payload });
      }
    });
    return;
  }

  if (msg.action === 'getLogs') {
    getTabLogs(msg.tabId).then((logs) => {
      sendResponse({ logs });
    });
    return true; // async sendResponse
  }

  if (msg.action === 'clearLogs') {
    clearTabLogs(msg.tabId).then(() => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.action === 'initPanel') {
    ensureInjected(msg.tabId);
    return;
  }
});

// ── Panel / popup communication via long-lived connections ────────────

const panelPorts = new Map(); // tabId → Set<Port>
const popupPorts = new Map(); // tabId → Set<Port>

chrome.runtime.onConnect.addListener((port) => {
  let targetMap = null;
  let tabId = null;

  if (port.name.startsWith('panel-')) {
    tabId = parseInt(port.name.replace('panel-', ''), 10);
    targetMap = panelPorts;
  } else if (port.name.startsWith('popup-')) {
    tabId = parseInt(port.name.replace('popup-', ''), 10);
    targetMap = popupPorts;
  }

  if (!targetMap || isNaN(tabId)) return;

  if (!targetMap.has(tabId)) targetMap.set(tabId, new Set());
  targetMap.get(tabId).add(port);

  port.onDisconnect.addListener(() => {
    const set = targetMap.get(tabId);
    if (set) {
      set.delete(port);
      if (set.size === 0) targetMap.delete(tabId);
    }
  });
});

function broadcastToPanel(tabId, message) {
  const ports = panelPorts.get(tabId);
  if (!ports) return;
  for (const port of ports) {
    try { port.postMessage(message); } catch { /* port closed */ }
  }
}

function broadcastToPopup(tabId, message) {
  const ports = popupPorts.get(tabId);
  if (!ports) return;
  for (const port of ports) {
    try { port.postMessage(message); } catch { /* port closed */ }
  }
}

// ── Cleanup on tab close ──────────────────────────────────────────────

chrome.tabs.onRemoved.addListener((tabId) => {
  deleteTabFromStorage(tabId);
  panelPorts.delete(tabId);
  popupPorts.delete(tabId);
});

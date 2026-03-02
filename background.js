/**
 * background.js — Service worker that manages state and injects content scripts.
 *
 * - Maintains a per-tab log of captured API calls.
 * - Injects content scripts on tab navigation.
 * - Provides the log data to the DevTools panel on request.
 */
'use strict';

// tabId → Array<ApiEntry>
const tabLogs = new Map();

// ── Side panel configuration ──────────────────────────────────────────

if (chrome.sidePanel) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
}

// ── Content-script injection on navigation ────────────────────────────

chrome.webNavigation?.onCommitted.addListener(async (details) => {
  // Only inject into top-level frames, skip chrome:// and edge:// etc.
  if (details.frameId !== 0) return;
  const url = details.url || '';
  if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('about:')) return;

  try {
    await chrome.scripting.executeScript({
      target: { tabId: details.tabId },
      files: ['content.js'],
      injectImmediately: true,
    });
  } catch {
    // Tab may have been closed or the URL isn't injectable
  }
});

// Also inject when the DevTools panel connects for the first time
// (covers the case where the page was already loaded before opening DevTools)
async function ensureInjected(tabId) {
  try {
    const url = (await chrome.tabs.get(tabId))?.url || '';
    if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('about:')) return;
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js'],
      injectImmediately: true,
    });
  } catch {
    // Ignore
  }
}

// ── Message handling ──────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'apiLog' && sender.tab) {
    const tabId = sender.tab.id;
    if (!tabLogs.has(tabId)) tabLogs.set(tabId, []);
    tabLogs.get(tabId).push(msg.payload);

    // Broadcast to any connected DevTools panels or popups for this tab
    broadcastToPanel(tabId, { action: 'newEntry', payload: msg.payload });
    broadcastToPopup(tabId, { action: 'newEntry', payload: msg.payload });
    return;
  }

  if (msg.action === 'getLogs') {
    const logs = tabLogs.get(msg.tabId) || [];
    sendResponse({ logs });
    return true;
  }

  if (msg.action === 'clearLogs') {
    tabLogs.set(msg.tabId, []);
    sendResponse({ ok: true });
    return true;
  }

  if (msg.action === 'initPanel') {
    ensureInjected(msg.tabId);
    return;
  }
});

// ── Panel communication via long-lived connections ────────────────────

const panelPorts = new Map(); // tabId → Set<Port>
const popupPorts = new Map(); // tabId → Set<Port>

chrome.runtime.onConnect.addListener((port) => {
  // Determine which map to register the port in
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
  tabLogs.delete(tabId);
  panelPorts.delete(tabId);
  popupPorts.delete(tabId);
});

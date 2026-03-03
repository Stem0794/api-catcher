/**
 * popup.js — Logic for the API Catcher toolbar popup dashboard.
 *
 * Shows a compact, live-updating view of API calls for the active tab.
 * Supports filtering, detail view, cURL/JSON copy, and Gist sharing.
 *
 * Entries are stored in the background service worker and reloaded
 * every time the popup opens, so closing the popup never loses data.
 *
 * Opens as a full-page dashboard when loaded with ?fullpage=1.
 */
(function () {
  'use strict';

  // ── Full-page mode detection ──────────────────────────────────────

  const params = new URLSearchParams(window.location.search);
  const isFullPage = params.has('fullpage');
  const paramTabId = params.get('tabId');

  if (isFullPage) {
    document.body.classList.add('fullpage');
  }

  // ── State ─────────────────────────────────────────────────────────

  let entries = [];
  let selectedEntry = null;
  let recording = true;
  let activeTabId = paramTabId ? parseInt(paramTabId, 10) : null;
  let port = null;

  // ── DOM refs ──────────────────────────────────────────────────────

  const entryCount = document.getElementById('entryCount');
  const liveIndicator = document.getElementById('liveIndicator');
  const requestList = document.getElementById('requestList');
  const emptyState = document.getElementById('emptyState');
  const listView = document.getElementById('listView');
  const detailView = document.getElementById('detailView');
  const filterInput = document.getElementById('filterInput');
  const methodFilter = document.getElementById('methodFilter');
  const statusFilter = document.getElementById('statusFilter');
  const toast = document.getElementById('toast');

  // Detail refs
  const dMethod = document.getElementById('dMethod');
  const dStatus = document.getElementById('dStatus');
  const dDuration = document.getElementById('dDuration');
  const dType = document.getElementById('dType');
  const dUrl = document.getElementById('dUrl');
  const dTimestamp = document.getElementById('dTimestamp');
  const dInitiator = document.getElementById('dInitiator');
  const dReqHeaders = document.getElementById('dReqHeaders');
  const dReqBody = document.getElementById('dReqBody');
  const dResHeaders = document.getElementById('dResHeaders');
  const dResBody = document.getElementById('dResBody');

  // ── Init ──────────────────────────────────────────────────────────

  function init(tabId) {
    activeTabId = tabId;

    // Ensure content script is injected
    chrome.runtime.sendMessage({ action: 'initPanel', tabId: activeTabId });

    // Connect for live updates
    port = chrome.runtime.connect({ name: `popup-${activeTabId}` });
    port.onMessage.addListener((msg) => {
      if (msg.action === 'newEntry' && recording) {
        addEntry(msg.payload);
      }
    });

    // Load existing logs from the background (survives popup close)
    chrome.runtime.sendMessage({ action: 'getLogs', tabId: activeTabId }, (res) => {
      if (res?.logs) {
        entries = res.logs;
        renderList();
      }
    });
  }

  if (activeTabId) {
    // Full-page mode with explicit tabId
    init(activeTabId);
  } else {
    // Sidebar / Popup mode — resolve from active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) return;
      init(tabs[0].id);
    });

    // Automatically follow tab switching (sidebar behavior)
    chrome.tabs.onActivated.addListener((activeInfo) => {
      if (port) port.disconnect();
      init(activeInfo.tabId);
    });
  }

  // ── Entry management ──────────────────────────────────────────────

  function addEntry(entry) {
    entries.push(entry);
    renderList();
  }

  function renderList() {
    const filtered = getFilteredEntries();
    entryCount.textContent = filtered.length;

    if (filtered.length === 0) {
      emptyState.style.display = 'flex';
      requestList.style.display = 'none';
      return;
    }

    emptyState.style.display = 'none';
    requestList.style.display = 'block';
    requestList.innerHTML = '';

    // Show newest first
    for (let i = filtered.length - 1; i >= 0; i--) {
      const entry = filtered[i];
      const li = document.createElement('li');
      li.className = 'req-item';
      if (selectedEntry && entry.id === selectedEntry.id) {
        li.classList.add('selected');
      }

      const statusClass = getStatusClass(entry.status);

      li.innerHTML = `
        <span class="method-badge method-${entry.method}">${entry.method}</span>
        <span class="status-col ${statusClass}">${entry.status || 0}</span>
        <span class="url-col" title="${escapeHtml(entry.url)}">${truncateUrl(entry.url)}</span>
        <span class="duration-col">${entry.duration != null ? entry.duration + 'ms' : ''}</span>
        <span class="time-col">${formatTime(entry.timestamp)}</span>
      `;

      li.addEventListener('click', () => showDetail(entry));
      requestList.appendChild(li);
    }
  }

  // ── Filtering ─────────────────────────────────────────────────────

  function getFilteredEntries() {
    const text = filterInput.value.toLowerCase().trim();
    const method = methodFilter.value;
    const status = statusFilter.value;

    return entries.filter((e) => {
      if (text && !e.url.toLowerCase().includes(text) && !e.method.toLowerCase().includes(text)) {
        return false;
      }
      if (method && e.method !== method) return false;
      if (status) {
        if (status === '0' && e.status !== 0) return false;
        if (status !== '0') {
          const range = parseInt(status);
          if (e.status < range || e.status >= range + 100) return false;
        }
      }
      return true;
    });
  }

  filterInput.addEventListener('input', renderList);
  methodFilter.addEventListener('change', renderList);
  statusFilter.addEventListener('change', renderList);

  // ── Detail view ───────────────────────────────────────────────────

  function showDetail(entry) {
    selectedEntry = entry;
    listView.style.display = 'none';
    document.getElementById('filterBar').style.display = 'none';
    detailView.classList.remove('hidden');

    dMethod.textContent = entry.method;
    dMethod.className = `method-badge method-${entry.method}`;

    const statusClass = getStatusClass(entry.status);
    dStatus.textContent = `${entry.status} ${entry.statusText || ''}`;
    dStatus.className = `status-pill ${statusClass}`;

    dDuration.textContent = entry.duration != null ? `${entry.duration}ms` : '';
    dType.textContent = entry.type.toUpperCase();
    dUrl.textContent = entry.url;
    dTimestamp.textContent = entry.timestamp;

    if (entry.initiator) {
      dInitiator.innerHTML = `
        <span class="context-label">Initiated from:</span>
        <a href="${escapeHtml(entry.initiator.url)}" target="_blank" class="context-link" title="${escapeHtml(entry.initiator.url)}">
          ${escapeHtml(entry.initiator.title || entry.initiator.url)}
        </a>
      `;
    } else {
      dInitiator.innerHTML = '';
    }

    dReqHeaders.textContent = prettyJson(entry.request?.headers);
    dReqBody.textContent = prettyBody(entry.request?.body);
    dResHeaders.textContent = prettyJson(entry.response?.headers);
    dResBody.textContent = prettyBody(entry.response?.body);
  }

  document.getElementById('btnBack').addEventListener('click', () => {
    detailView.classList.add('hidden');
    listView.style.display = '';
    document.getElementById('filterBar').style.display = '';
    renderList();
  });

  // ── Recording toggle ──────────────────────────────────────────────

  const btnRecord = document.getElementById('btnToggleRecord');
  const recordLabel = document.getElementById('recordLabel');
  btnRecord.addEventListener('click', () => {
    recording = !recording;
    btnRecord.classList.toggle('paused', !recording);
    liveIndicator.classList.toggle('paused', !recording);
    recordLabel.textContent = recording ? 'Recording' : 'Paused';
    btnRecord.title = recording ? 'Pause recording' : 'Resume recording';
  });

  // ── Clear ─────────────────────────────────────────────────────────

  document.getElementById('btnClear').addEventListener('click', () => {
    entries = [];
    selectedEntry = null;
    detailView.classList.add('hidden');
    listView.style.display = '';
    document.getElementById('filterBar').style.display = '';
    renderList();
    if (activeTabId != null) {
      chrome.runtime.sendMessage({ action: 'clearLogs', tabId: activeTabId });
    }
  });

  // ── Export all ────────────────────────────────────────────────────

  document.getElementById('btnExportAll').addEventListener('click', () => {
    const filtered = getFilteredEntries();
    copyToClipboard(JSON.stringify(filtered, null, 2));
    showToast(`Copied ${filtered.length} entries as JSON`, 'success');
  });

  // ── Full-page dashboard ───────────────────────────────────────────

  document.getElementById('btnFullPage').addEventListener('click', () => {
    const tabId = activeTabId || 0;
    const url = chrome.runtime.getURL(`popup.html?fullpage&tabId=${tabId}`);
    chrome.tabs.create({ url });
    // Close the popup after opening the full-page tab
    window.close();
  });

  // ── Settings ──────────────────────────────────────────────────────

  document.getElementById('btnSettings').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // ── Copy as cURL ──────────────────────────────────────────────────

  document.getElementById('btnCopyCurl').addEventListener('click', () => {
    if (!selectedEntry) return;
    const e = selectedEntry;
    const parts = [`curl -X ${e.method}`, `'${e.url}'`];

    if (e.request?.headers) {
      for (const [k, v] of Object.entries(e.request.headers)) {
        parts.push(`-H '${k}: ${v}'`);
      }
    }

    if (e.request?.body) {
      const body = typeof e.request.body === 'string' ? e.request.body : JSON.stringify(e.request.body);
      parts.push(`-d '${body.replace(/'/g, "'\\''")}'`);
    }

    let curl = parts.join(' \\\n  ');
    if (e.initiator) {
      curl = `# Initiated from: ${e.initiator.title} (${e.initiator.url})\n${curl}`;
    }

    copyToClipboard(curl);
    showToast('Copied as cURL', 'success');
  });

  // ── Copy as JSON ──────────────────────────────────────────────────

  document.getElementById('btnCopyJson').addEventListener('click', () => {
    if (!selectedEntry) return;
    copyToClipboard(JSON.stringify(selectedEntry, null, 2));
    showToast('Copied as JSON', 'success');
  });

  // ── Share via Gist ────────────────────────────────────────────────

  document.getElementById('btnShareGist').addEventListener('click', async () => {
    if (!selectedEntry) return;

    const btn = document.getElementById('btnShareGist');
    btn.disabled = true;
    const label = btn.querySelector('.btn-label');
    const origText = label.textContent;
    label.textContent = 'Creating...';

    try {
      const { githubPat } = await chrome.storage.local.get('githubPat');
      if (!githubPat) {
        showToast('No GitHub PAT. Open Settings to add one.', 'error');
        return;
      }

      // Sanitize before sharing — redacts tokens, secrets, etc.
      const sanitized = sanitizePayload(selectedEntry);
      const filename = `api-catcher-${selectedEntry.method}-${Date.now()}.json`;
      const content = JSON.stringify(sanitized, null, 2);

      const response = await fetch('https://api.github.com/gists', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${githubPat}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({
          description: `API Catcher: ${selectedEntry.method} ${truncateUrl(selectedEntry.url, 60)} (Page: ${selectedEntry.initiator?.title || 'unknown'})`,
          public: false,
          files: { [filename]: { content } },
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${response.status}`);
      }

      const data = await response.json();
      await copyToClipboard(data.html_url);
      showToast('Gist link copied!', 'success');
    } catch (err) {
      showToast(`Gist failed: ${err.message}`, 'error');
    } finally {
      btn.disabled = false;
      label.textContent = origText;
    }
  });

  // ── Helpers ───────────────────────────────────────────────────────

  function getStatusClass(status) {
    if (status === 0) return 'status-0';
    if (status >= 200 && status < 300) return 'status-2xx';
    if (status >= 300 && status < 400) return 'status-3xx';
    if (status >= 400 && status < 500) return 'status-4xx';
    if (status >= 500) return 'status-5xx';
    return '';
  }

  function truncateUrl(url, max = 60) {
    try {
      const u = new URL(url);
      const path = u.pathname + u.search;
      return path.length > max ? path.slice(0, max) + '...' : path;
    } catch {
      return url?.length > max ? url.slice(0, max) + '...' : url;
    }
  }

  function formatTime(ts) {
    try {
      return new Date(ts).toLocaleTimeString('en-US', { hour12: false });
    } catch {
      return ts;
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function prettyJson(obj) {
    if (!obj || (typeof obj === 'object' && Object.keys(obj).length === 0)) return '(empty)';
    try { return JSON.stringify(obj, null, 2); } catch { return String(obj); }
  }

  function prettyBody(body) {
    if (!body) return '(empty)';
    try { return JSON.stringify(JSON.parse(body), null, 2); } catch { return String(body); }
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
  }

  function showToast(message, type = 'info') {
    toast.textContent = message;
    toast.className = `toast ${type}`;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.add('hidden'), 3000);
  }
})();

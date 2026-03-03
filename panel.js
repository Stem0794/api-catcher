/**
 * panel.js — Main logic for the API Catcher DevTools panel.
 *
 * Manages the list view, detail view, filtering, clipboard operations,
 * and GitHub Gist sharing.
 */
(function () {
  'use strict';
  console.log('API Catcher: panel.js started execution.');

  const tabId = chrome.devtools.inspectedWindow.tabId;
  console.log('API Catcher: Initializing panel for tabId:', tabId);

  // ── State ─────────────────────────────────────────────────────────

  let entries = [];
  let selectedEntry = null;
  let selectedRow = null;
  let modificationRules = [];

  // ── DOM refs ──────────────────────────────────────────────────────

  const logBody = document.getElementById('logBody');
  const emptyState = document.getElementById('emptyState');
  const entryCount = document.getElementById('entryCount');
  const filterInput = document.getElementById('filterInput');
  const methodFilter = document.getElementById('methodFilter');
  const statusFilter = document.getElementById('statusFilter');
  const detailPanel = document.getElementById('detailPanel');
  const resizeHandle = document.getElementById('resizeHandle');
  const toast = document.getElementById('toast');

  // Modification rule elements
  const ruleUrlPattern = document.getElementById('ruleUrlPattern');
  const ruleTarget = document.getElementById('ruleTarget');
  const ruleValue = document.getElementById('ruleValue');
  const btnAddRule = document.getElementById('btnAddRule');
  const ruleList = document.getElementById('ruleList');
  console.log('API Catcher: DOM elements for rules:', { ruleUrlPattern, ruleTarget, ruleValue, btnAddRule, ruleList });

  // Detail elements
  const detailMethod = document.getElementById('detailMethod');
  const detailUrl = document.getElementById('detailUrl');
  const detailStatus = document.getElementById('detailStatus');
  const detailDuration = document.getElementById('detailDuration');
  const detailTimestamp = document.getElementById('detailTimestamp');
  const detailType = document.getElementById('detailType');
  const reqHeaders = document.getElementById('reqHeaders');
  const reqBody = document.getElementById('reqBody');
  const resHeaders = document.getElementById('resHeaders');
  const resBody = document.getElementById('resBody');

  // ── Connect to background for live updates ────────────────────────

  const port = chrome.runtime.connect({ name: `panel-${tabId}` });
  port.onMessage.addListener((msg) => {
    if (msg.action === 'newEntry') {
      addEntry(msg.payload);
    }
  });

  // Ask background to inject content script if not already
  chrome.runtime.sendMessage({ action: 'initPanel', tabId });

  // Load existing logs
  chrome.runtime.sendMessage({ action: 'getLogs', tabId }, (res) => {
    if (res?.logs) {
      res.logs.forEach((e) => addEntry(e, false));
      renderList();
    }
  });

  // ── Modification Rules ──────────────────────────────────────────

  function renderRuleList() {
    console.log('API Catcher: renderRuleList called.');
    ruleList.innerHTML = '';
    for (const rule of modificationRules) {
      const li = document.createElement('li');
      li.dataset.id = rule.id;
      li.innerHTML = `
        <span class="rule-pattern">${rule.pattern}</span>
        <span>&rarr;</span>
        <span>${rule.target}</span>
        <button class="delete-rule" title="Delete rule">&times;</button>
      `;
      ruleList.appendChild(li);
    }
  }

  function addRule() {
    const pattern = ruleUrlPattern.value.trim();
    if (!pattern) {
      showToast('URL pattern cannot be empty', 'error');
      return;
    }

    const rule = {
      id: `rule-${Date.now()}`,
      pattern: pattern,
      target: ruleTarget.value,
      value: ruleValue.value,
    };

    modificationRules.push(rule);
    chrome.runtime.sendMessage({ action: 'addModificationRule', payload: rule });
    renderRuleList();

    // Clear inputs
    ruleUrlPattern.value = '';
    ruleValue.value = '';
  }

  function deleteRule(id) {
    modificationRules = modificationRules.filter(r => r.id !== id);
    chrome.runtime.sendMessage({ action: 'deleteModificationRule', payload: id });
    renderRuleList();
  }

  btnAddRule.addEventListener('click', addRule);
  ruleList.addEventListener('click', (e) => {
    if (e.target.classList.contains('delete-rule')) {
      const id = e.target.closest('li').dataset.id;
      deleteRule(id);
    }
  });

  // Load existing rules
  chrome.runtime.sendMessage({ action: 'getModificationRules' }, (res) => {
    console.log('API Catcher: getModificationRules response received:', res);
    if (res?.rules) {
      modificationRules = res.rules;
      renderRuleList();
    }
  });

  // ── Entry management ──────────────────────────────────────────────

  function addEntry(entry, render = true) {
    entries.push(entry);
    if (render) renderList();
  }

  function renderList() {
    const filtered = getFilteredEntries();
    logBody.innerHTML = '';
    entryCount.textContent = filtered.length;

    emptyState.style.display = filtered.length === 0 ? 'flex' : 'none';

    for (const entry of filtered) {
      const tr = document.createElement('tr');
      tr.dataset.id = entry.id;

      if (selectedEntry && entry.id === selectedEntry.id) {
        tr.classList.add('selected');
        selectedRow = tr;
      }

      const statusClass = getStatusClass(entry.status);

      tr.innerHTML = `
        <td class="${statusClass}">${entry.status || 0}</td>
        <td><span class="method-badge method-${entry.method}">${entry.method}</span></td>
        <td title="${escapeHtml(entry.url)}">${truncateUrl(entry.url)}</td>
        <td class="type-${entry.type}">${entry.type}</td>
        <td>${entry.duration != null ? entry.duration + 'ms' : '-'}</td>
        <td>${formatTime(entry.timestamp)}</td>
      `;

      tr.addEventListener('click', () => selectEntry(entry, tr));
      logBody.appendChild(tr);
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

  function selectEntry(entry, row) {
    if (selectedRow) selectedRow.classList.remove('selected');
    selectedEntry = entry;
    selectedRow = row;
    row.classList.add('selected');

    detailPanel.classList.remove('hidden');
    resizeHandle.style.display = 'block';

    detailMethod.textContent = entry.method;
    detailMethod.className = `method-badge method-${entry.method}`;
    detailUrl.textContent = entry.url;

    const statusClass = getStatusClass(entry.status);
    detailStatus.innerHTML = `<span class="${statusClass}">Status: ${entry.status} ${entry.statusText || ''}</span>`;
    detailDuration.textContent = entry.duration != null ? `${entry.duration}ms` : '';
    detailTimestamp.textContent = entry.timestamp;
    detailType.textContent = entry.type.toUpperCase();

    reqHeaders.textContent = prettyJson(entry.request?.headers);
    reqBody.textContent = prettyBody(entry.request?.body);
    resHeaders.textContent = prettyJson(entry.response?.headers);
    resBody.textContent = prettyBody(entry.response?.body);
  }

  document.getElementById('btnCloseDetail').addEventListener('click', () => {
    detailPanel.classList.add('hidden');
    resizeHandle.style.display = 'none';
    if (selectedRow) selectedRow.classList.remove('selected');
    selectedEntry = null;
    selectedRow = null;
  });

  // ── Section toggles ───────────────────────────────────────────────

  document.querySelectorAll('.section-toggle').forEach((toggle) => {
    toggle.addEventListener('click', () => {
      const target = document.getElementById(toggle.dataset.target);
      target.classList.toggle('collapsed');
      toggle.classList.toggle('expanded');
    });
  });

  // ── Clear logs ────────────────────────────────────────────────────

  document.getElementById('btnClear').addEventListener('click', () => {
    entries = [];
    selectedEntry = null;
    selectedRow = null;
    detailPanel.classList.add('hidden');
    resizeHandle.style.display = 'none';
    renderList();
    chrome.runtime.sendMessage({ action: 'clearLogs', tabId });
  });

  // ── Export all visible logs ───────────────────────────────────────

  document.getElementById('btnExportAll').addEventListener('click', () => {
    const filtered = getFilteredEntries();
    const blob = JSON.stringify(filtered, null, 2);
    copyToClipboard(blob);
    showToast('Copied all visible logs as JSON', 'success');
  });

  // ── Copy as cURL ──────────────────────────────────────────────────

  document.getElementById('btnCopyCurl').addEventListener('click', () => {
    if (!selectedEntry) return;
    const e = selectedEntry;
    const parts = [`curl -X ${e.method}`];
    parts.push(`'${e.url}'`);

    if (e.request?.headers) {
      for (const [k, v] of Object.entries(e.request.headers)) {
        parts.push(`-H '${k}: ${v}'`);
      }
    }

    if (e.request?.body) {
      const body = typeof e.request.body === 'string' ? e.request.body : JSON.stringify(e.request.body);
      parts.push(`-d '${body.replace(/'/g, "'\\''")}'`);
    }

    copyToClipboard(parts.join(' \\\n  '));
    showToast('Copied as cURL', 'success');
  });

  // ── Copy as JSON ──────────────────────────────────────────────────

  document.getElementById('btnCopyJson').addEventListener('click', () => {
    if (!selectedEntry) return;
    copyToClipboard(JSON.stringify(selectedEntry, null, 2));
    showToast('Copied as JSON', 'success');
  });

  // ── Share via GitHub Gist ─────────────────────────────────────────

  document.getElementById('btnShareGist').addEventListener('click', async () => {
    if (!selectedEntry) return;

    const btn = document.getElementById('btnShareGist');
    btn.disabled = true;
    btn.textContent = 'Creating Gist...';

    try {
      // Retrieve the PAT from storage
      const { githubPat } = await chrome.storage.local.get('githubPat');
      if (!githubPat) {
        showToast('No GitHub PAT configured. Open extension Options to add one.', 'error');
        return;
      }

      // Sanitize before sharing — redacts tokens, secrets, etc.
      const sanitized = sanitizePayload(selectedEntry);
      const filename = `api-catcher-${selectedEntry.method}-${Date.now()}.json`;
      const content = JSON.stringify(sanitized, null, 2);

      const gistPayload = {
        description: `API Catcher log: ${selectedEntry.method} ${truncateUrl(selectedEntry.url, 80)}`,
        public: false,
        files: {
          [filename]: { content },
        },
      };

      const response = await fetch('https://api.github.com/gists', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${githubPat}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify(gistPayload),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || `GitHub API returned ${response.status}`);
      }

      const data = await response.json();
      await copyToClipboard(data.html_url);
      showToast(`Gist created! Link copied to clipboard.`, 'success');
    } catch (err) {
      showToast(`Gist failed: ${err.message}`, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Share via Gist';
    }
  });

  // ── Resize handle ─────────────────────────────────────────────────

  let isResizing = false;

  resizeHandle.addEventListener('mousedown', (e) => {
    isResizing = true;
    resizeHandle.classList.add('active');
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const container = document.getElementById('splitView');
    const rect = container.getBoundingClientRect();
    const listWidth = e.clientX - rect.left;
    const detailWidth = rect.right - e.clientX;

    if (listWidth >= 250 && detailWidth >= 280) {
      document.getElementById('listPanel').style.flex = 'none';
      document.getElementById('listPanel').style.width = listWidth + 'px';
      detailPanel.style.width = detailWidth + 'px';
    }
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      resizeHandle.classList.remove('active');
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

  function truncateUrl(url, max = 100) {
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
      const d = new Date(ts);
      return d.toLocaleTimeString('en-US', { hour12: false });
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
    try {
      return JSON.stringify(obj, null, 2);
    } catch {
      return String(obj);
    }
  }

  function prettyBody(body) {
    if (!body) return '(empty)';
    try {
      const parsed = JSON.parse(body);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return String(body);
    }
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for contexts where navigator.clipboard is not available
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
    toast._timer = setTimeout(() => {
      toast.classList.add('hidden');
    }, 3500);
  }
})();

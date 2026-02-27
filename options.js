/**
 * options.js — Logic for the API Catcher options/settings page.
 *
 * Manages saving, loading, and removing the GitHub PAT from
 * chrome.storage.local.
 */
(function () {
  'use strict';

  const patInput = document.getElementById('patInput');
  const btnSave = document.getElementById('btnSave');
  const btnRemove = document.getElementById('btnRemove');
  const toggleVis = document.getElementById('toggleVis');
  const statusMsg = document.getElementById('statusMsg');
  const statusDot = document.getElementById('statusDot');
  const statusLabel = document.getElementById('statusLabel');

  // ── Load existing token on page open ──────────────────────────────

  chrome.storage.local.get('githubPat', ({ githubPat }) => {
    if (githubPat) {
      // Show masked version — never display the full token
      patInput.value = maskToken(githubPat);
      patInput.dataset.masked = 'true';
      setStatus(true);
    } else {
      setStatus(false);
    }
  });

  // Clear the masked placeholder when the user starts typing
  patInput.addEventListener('focus', () => {
    if (patInput.dataset.masked === 'true') {
      patInput.value = '';
      patInput.dataset.masked = 'false';
    }
  });

  // ── Save ──────────────────────────────────────────────────────────

  btnSave.addEventListener('click', () => {
    const token = patInput.value.trim();
    if (!token || patInput.dataset.masked === 'true') {
      showMsg('Please enter a valid token.', 'error');
      return;
    }

    chrome.storage.local.set({ githubPat: token }, () => {
      patInput.value = maskToken(token);
      patInput.dataset.masked = 'true';
      setStatus(true);
      showMsg('Token saved successfully.', 'success');
    });
  });

  // ── Remove ────────────────────────────────────────────────────────

  btnRemove.addEventListener('click', () => {
    chrome.storage.local.remove('githubPat', () => {
      patInput.value = '';
      patInput.dataset.masked = 'false';
      setStatus(false);
      showMsg('Token removed.', 'success');
    });
  });

  // ── Toggle visibility ─────────────────────────────────────────────

  toggleVis.addEventListener('click', () => {
    patInput.type = patInput.type === 'password' ? 'text' : 'password';
  });

  // ── Helpers ───────────────────────────────────────────────────────

  function maskToken(token) {
    if (token.length <= 8) return '****';
    return token.slice(0, 4) + '*'.repeat(token.length - 8) + token.slice(-4);
  }

  function setStatus(active) {
    statusDot.className = `dot ${active ? 'active' : 'inactive'}`;
    statusLabel.textContent = active ? 'Token configured' : 'No token configured';
  }

  function showMsg(text, type) {
    statusMsg.textContent = text;
    statusMsg.className = `status-msg ${type}`;
    setTimeout(() => { statusMsg.textContent = ''; }, 4000);
  }
})();

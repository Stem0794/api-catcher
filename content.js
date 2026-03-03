/**
 * content.js — Content script that bridges the page world and the extension.
 *
 * 1. Injects interceptor.js into the page's MAIN world so it can
 *    monkey-patch fetch/XHR.
 * 2. Listens for postMessage events from the interceptor and forwards
 *    them to the background service worker via chrome.runtime.sendMessage.
 *
 * Guards against multiple injections — chrome.scripting.executeScript may
 * run this file more than once per page (navigation + initPanel).
 */
(function () {
  'use strict';

  // Prevent duplicate listeners when content.js is injected more than once
  if (window.__apiCatcherContentInjected) return;
  window.__apiCatcherContentInjected = true;

  // 1. Get rules from background
  chrome.runtime.sendMessage({ action: 'getRulesForContentScript' }, (response) => {
    if (!response || !response.rules) {
      console.error('API Catcher: Could not load modification rules.');
      return;
    }

    // 2. Inject rules into the page via a script tag
    const rulesScript = document.createElement('script');
    rulesScript.textContent = `window.__API_CATCHER_RULES__ = ${JSON.stringify(response.rules)};`;
    (document.head || document.documentElement).appendChild(rulesScript);
    rulesScript.remove();

    // 3. Inject the interceptor script, which will use the rules
    const interceptorScript = document.createElement('script');
    interceptorScript.src = chrome.runtime.getURL('interceptor.js');
    interceptorScript.onload = () => interceptorScript.remove();
    (document.head || document.documentElement).appendChild(interceptorScript);
  });

  // Relay captured API calls from the page to the service worker
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data?.type !== '__API_CATCHER_LOG__') return;

    chrome.runtime.sendMessage({
      action: 'apiLog',
      payload: event.data.payload,
    });
  });
})();

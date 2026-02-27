/**
 * content.js — Content script that bridges the page world and the extension.
 *
 * 1. Injects interceptor.js into the page's MAIN world so it can
 *    monkey-patch fetch/XHR.
 * 2. Listens for postMessage events from the interceptor and forwards
 *    them to the background service worker via chrome.runtime.sendMessage.
 */
(function () {
  'use strict';

  // Inject the interceptor script into the page's MAIN world
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('interceptor.js');
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);

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

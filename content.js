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
  console.log('API Catcher: content.js injected.'); // DEBUG LOG

  // Prevent duplicate listeners when content.js is injected more than once
  if (window.__apiCatcherContentInjected) return;
  window.__apiCatcherContentInjected = true;

  // Inject the interceptor script
  console.log('API Catcher: Creating interceptor script tag...'); // DEBUG LOG
  const interceptorScript = document.createElement('script');
  interceptorScript.src = chrome.runtime.getURL('interceptor.js');
  console.log('API Catcher: Interceptor URL:', interceptorScript.src); // DEBUG LOG
  interceptorScript.onload = () => {
    console.log('API Catcher: interceptor.js loaded and executed.'); // DEBUG LOG
    interceptorScript.remove();
  };
  interceptorScript.onerror = (e) => {
    console.error('API Catcher: Failed to load interceptor.js:', e); // DEBUG LOG
  };
  console.log('API Catcher: Appending interceptor script to DOM...'); // DEBUG LOG
  (document.head || document.documentElement).appendChild(interceptorScript);
  console.log('API Catcher: Interceptor script appended.'); // DEBUG LOG

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

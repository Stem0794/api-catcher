/**
 * interceptor.js — Injected into the page context via the content script.
 *
 * Monkey-patches XMLHttpRequest and fetch() to capture request/response
 * details and relay them back to the content script via window.postMessage.
 */
(function () {
  'use strict';

  if (window.__apiCatcherInjected) return;
  window.__apiCatcherInjected = true;

  const MSG_TYPE = '__API_CATCHER_LOG__';

  // ── Helpers ──────────────────────────────────────────────────────────

  function safeStringify(obj) {
    try {
      return JSON.stringify(obj);
    } catch {
      return String(obj);
    }
  }

  function headersToObject(headers) {
    const out = {};
    if (headers instanceof Headers) {
      headers.forEach((v, k) => { out[k] = v; });
    } else if (Array.isArray(headers)) {
      headers.forEach(([k, v]) => { out[k] = v; });
    } else if (headers && typeof headers === 'object') {
      Object.assign(out, headers);
    }
    return out;
  }

  function post(entry) {
    window.postMessage({ type: MSG_TYPE, payload: entry }, '*');
  }

  // ── Rule application ───────────────────────────────────────────────

  function applyModificationRules(url, method, reqHeaders, reqBody) {
    const rules = window.__API_CATCHER_RULES__ || [];
    let modified = false;

    for (const rule of rules) {
      if (url.includes(rule.pattern)) {
        if (rule.target === 'reqBody') {
          reqBody = rule.value;
          modified = true;
        } else if (rule.target === 'reqHeaders') {
          try {
            const [name, value] = rule.value.split(/:\s*/);
            if (name && value) {
              reqHeaders[name] = value;
              modified = true;
            }
          } catch {
            console.error(`API Catcher: Invalid header rule value: ${rule.value}`);
          }
        }
      }
    }
    return { reqHeaders, reqBody };
  }

  // ── Fetch interception ──────────────────────────────────────────────

  const originalFetch = window.fetch;

  window.fetch = async function (...args) {
    const [resource, init] = args;
    const url = typeof resource === 'string'
      ? resource
      : resource instanceof Request
        ? resource.url
        : String(resource);

    const method = (init?.method
      || (resource instanceof Request ? resource.method : 'GET')).toUpperCase();

    let reqHeaders = headersToObject(
      init?.headers || (resource instanceof Request ? resource.headers : {})
    );

    let reqBody = null;
    if (init?.body !== undefined) {
      reqBody = typeof init.body === 'string' ? init.body : safeStringify(init.body);
    } else if (resource instanceof Request) {
      try { reqBody = await resource.clone().text(); } catch { /* empty */ }
    }

    // Apply modification rules
    const modified = applyModificationRules(url, method, reqHeaders, reqBody);
    reqHeaders = modified.reqHeaders;
    reqBody = modified.reqBody;

    // Re-create the arguments for fetch
    const newArgs = [...args];
    const bodyAllowed = !['GET', 'HEAD'].includes(method);

    if (newArgs[1]) { // if init object exists
      newArgs[1].headers = reqHeaders;
      if (bodyAllowed && reqBody !== null) {
        newArgs[1].body = reqBody;
      }
    } else if (newArgs[0] instanceof Request) {
        const oldRequest = newArgs[0];
        const newRequestInit = {
            method: oldRequest.method,
            headers: reqHeaders,
            mode: oldRequest.mode,
            credentials: oldRequest.credentials,
            cache: oldRequest.cache,
            redirect: oldRequest.redirect,
            referrer: oldRequest.referrer,
            integrity: oldRequest.integrity,
        };
        if (bodyAllowed && reqBody !== null) {
            newRequestInit.body = reqBody;
        }
        newArgs[0] = new Request(oldRequest.url, newRequestInit);
    } else {
        newArgs[1] = { headers: reqHeaders };
        if (bodyAllowed && reqBody !== null) {
            newArgs[1].body = reqBody;
        }
    }

    const timestamp = new Date().toISOString();
    const startTime = performance.now();

    try {
      const response = await originalFetch.apply(this, newArgs);
      const duration = Math.round(performance.now() - startTime);

      const resHeaders = headersToObject(response.headers);

      let resBody = null;
      try {
        const clone = response.clone();
        resBody = await clone.text();
      } catch { /* empty */ }

      post({
        id: crypto.randomUUID(),
        type: 'fetch',
        method,
        url,
        status: response.status,
        statusText: response.statusText,
        timestamp,
        duration,
        request: { headers: reqHeaders, body: reqBody },
        response: { headers: resHeaders, body: resBody },
      });

      return response;
    } catch (err) {
      const duration = Math.round(performance.now() - startTime);
      post({
        id: crypto.randomUUID(),
        type: 'fetch',
        method,
        url,
        status: 0,
        statusText: 'Network Error',
        timestamp,
        duration,
        request: { headers: reqHeaders, body: reqBody },
        response: { headers: {}, body: null },
        error: err.message,
      });
      throw err;
    }
  };

  // ── XHR interception ────────────────────────────────────────────────

  const XHR = XMLHttpRequest;
  const originalOpen = XHR.prototype.open;
  const originalSend = XHR.prototype.send;
  const originalSetRequestHeader = XHR.prototype.setRequestHeader;

  XHR.prototype.open = function (method, url, ...rest) {
    this.__ac = {
      method: method.toUpperCase(),
      url: String(url),
      reqHeaders: {},
      startTime: null,
    };
    return originalOpen.call(this, method, url, ...rest);
  };

  XHR.prototype.setRequestHeader = function (name, value) {
    if (this.__ac) {
      this.__ac.reqHeaders[name] = value;
    }
    return originalSetRequestHeader.call(this, name, value);
  };

  XHR.prototype.send = function (body) {
    if (this.__ac) {
      const meta = this.__ac;

      // Apply modification rules
      const modified = applyModificationRules(meta.url, meta.method, meta.reqHeaders, body);
      meta.reqHeaders = modified.reqHeaders;
      const newBody = modified.reqBody;

      // Re-apply modified headers
      for (const name in meta.reqHeaders) {
        originalSetRequestHeader.call(this, name, meta.reqHeaders[name]);
      }

      meta.startTime = performance.now();
      meta.reqBody = typeof newBody === 'string' ? newBody : safeStringify(newBody);
      meta.timestamp = new Date().toISOString();

      this.addEventListener('loadend', function () {
        const duration = Math.round(performance.now() - meta.startTime);

        const resHeaders = {};
        (this.getAllResponseHeaders() || '').trim().split(/\r?\n/).forEach((line) => {
          const idx = line.indexOf(':');
          if (idx > 0) {
            resHeaders[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
          }
        });

        post({
          id: crypto.randomUUID(),
          type: 'xhr',
          method: meta.method,
          url: meta.url,
          status: this.status,
          statusText: this.statusText,
          timestamp: meta.timestamp,
          duration,
          request: { headers: meta.reqHeaders, body: meta.reqBody },
          response: { headers: resHeaders, body: this.responseText },
        });
      });
      return originalSend.call(this, newBody);
    }
    return originalSend.call(this, body);
  };
})();

/**
 * sanitizer.js — Auto-redaction utility for API Catcher.
 *
 * Sanitizes captured API logs before they are shared externally (e.g. via
 * GitHub Gist). Recursively traverses nested objects/arrays, redacts values
 * whose keys match sensitive patterns, and handles stringified JSON payloads.
 *
 * IMPORTANT: Always operates on a deep copy — the original log entry
 * displayed in the local extension UI is never mutated.
 *
 * Usage:
 *   const clean = sanitizePayload(rawApiLogEntry);
 */

// ── Configurable sensitive key patterns ──────────────────────────────
// Add or remove patterns here. Each regex is tested against key names
// (case-insensitive). Covers OWASP common secrets plus cloud/API tokens.

const SENSITIVE_PATTERNS = [
  /^authorization$/i,
  /^proxy-authorization$/i,
  /^cookie$/i,
  /^set-cookie$/i,
  /^x-api-key$/i,
  /^x-auth-token$/i,
  /password/i,
  /passwd/i,
  /secret/i,
  /token/i,
  /api[_-]?key/i,
  /access[_-]?key/i,
  /session[_-]?id/i,
  /csrf/i,
  /xsrf/i,
  /private[_-]?key/i,
  /client[_-]?secret/i,
  /auth/i,
  /credential/i,
  /ssn/i,
  /credit[_-]?card/i,
];

const REDACTED = '[REDACTED]';

// ── Deep clone ───────────────────────────────────────────────────────

function deepClone(value) {
  // structuredClone is available in modern Chrome (96+), which is
  // guaranteed since we require Manifest V3 (Chrome 88+).
  // Fall back to JSON round-trip for safety.
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value));
  }
}

// ── Key matching ─────────────────────────────────────────────────────

function isSensitiveKey(key) {
  if (typeof key !== 'string') return false;
  return SENSITIVE_PATTERNS.some((re) => re.test(key));
}

// ── Recursive redaction ──────────────────────────────────────────────

/**
 * Recursively traverse `obj` and replace values for sensitive keys with
 * "[REDACTED]". Handles:
 *   - Plain objects (including nested)
 *   - Arrays (including arrays of key-value pair tuples)
 *   - null / undefined / primitives (returned as-is)
 *   - Stringified JSON values (parsed → redacted → re-stringified)
 */
function redactObject(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => {
      // Handle [key, value] tuple format (common in Headers)
      if (
        Array.isArray(item) &&
        item.length === 2 &&
        typeof item[0] === 'string'
      ) {
        return isSensitiveKey(item[0]) ? [item[0], REDACTED] : [item[0], redactObject(item[1])];
      }
      return redactObject(item);
    });
  }

  // Plain object
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    if (isSensitiveKey(key)) {
      out[key] = REDACTED;
    } else if (typeof value === 'string') {
      out[key] = tryRedactStringifiedJson(value);
    } else {
      out[key] = redactObject(value);
    }
  }
  return out;
}

// ── Stringified JSON handling ────────────────────────────────────────

/**
 * If `str` looks like a stringified JSON object or array, parse it,
 * redact sensitive keys inside, and stringify it back.
 * Otherwise return the original string unchanged.
 */
function tryRedactStringifiedJson(str) {
  const trimmed = str.trim();
  // Quick guard: only attempt parse if it looks like JSON
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      const parsed = JSON.parse(trimmed);
      const redacted = redactObject(parsed);
      return JSON.stringify(redacted);
    } catch {
      // Not valid JSON — return as-is
    }
  }
  return str;
}

// ── Header-specific sanitization ─────────────────────────────────────

/**
 * Sanitize HTTP headers. Accepts:
 *   - An object { "Header-Name": "value" }
 *   - An array of [key, value] tuples
 *   - null/undefined
 */
function redactHeaders(headers) {
  if (!headers) return headers;
  return redactObject(headers);
}

// ── Main entry point ─────────────────────────────────────────────────

/**
 * Sanitize a full API log entry for external sharing.
 *
 * @param {object} rawEntry — The raw log entry from the extension.
 * @returns {object} A deep copy with all sensitive values replaced by "[REDACTED]".
 */
function sanitizePayload(rawEntry) {
  if (!rawEntry || typeof rawEntry !== 'object') return rawEntry;

  // Deep clone first — never mutate the original
  const entry = deepClone(rawEntry);

  // Redact request
  if (entry.request) {
    entry.request.headers = redactHeaders(entry.request.headers);
    if (typeof entry.request.body === 'string') {
      entry.request.body = tryRedactStringifiedJson(entry.request.body);
    } else if (entry.request.body && typeof entry.request.body === 'object') {
      entry.request.body = redactObject(entry.request.body);
    }
  }

  // Redact response
  if (entry.response) {
    entry.response.headers = redactHeaders(entry.response.headers);
    if (typeof entry.response.body === 'string') {
      entry.response.body = tryRedactStringifiedJson(entry.response.body);
    } else if (entry.response.body && typeof entry.response.body === 'object') {
      entry.response.body = redactObject(entry.response.body);
    }
  }

  // Redact the URL query string (may contain tokens/keys)
  if (typeof entry.url === 'string') {
    try {
      const u = new URL(entry.url);
      let changed = false;
      for (const [key] of u.searchParams) {
        if (isSensitiveKey(key)) {
          u.searchParams.set(key, REDACTED);
          changed = true;
        }
      }
      if (changed) entry.url = u.toString();
    } catch {
      // Relative URL or unparseable — leave as-is
    }
  }

  return entry;
}

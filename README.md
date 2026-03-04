# API Catcher

A Manifest V3 Chrome extension for QA testers to monitor, log, and securely share API network activity.

## Features

- **Network Interception** — Captures all XHR and Fetch requests with full details (method, URL, status, headers, body, timing).
- **Multiple Views** — Use the **Toolbar Popup**, the browser's native **Side Panel**, or a dedicated **DevTools Panel**.
- **Auto-Redaction Sanitizer** — Automatically redacts sensitive keys (e.g., `Authorization`, `token`, `password`) from logs before they are shared.
- **Log Persistence** — Logs are stored per-tab in `chrome.storage.session` and survive service worker restarts or popup closes.
- **Initiator Context** — Tracks the page URL and title where each request originated.
- **Copy & Export** — One-click export as **cURL**, **JSON**, or a full list export.
- **GitHub Gist Sharing** — Create a secret, sanitized Gist from any request and auto-copy the link.
- **Dark Theme** — Clean, modern dark UI across all extension views.

## Project Structure

```
api-catcher/
├── manifest.json          # Extension manifest (MV3)
├── background.js          # Service worker: manages per-tab logs, injects content scripts
├── content.js             # Content script: bridges page world ↔ extension
├── interceptor.js         # Injected into page context: monkey-patches fetch/XHR
├── sanitizer.js           # Shared utility: auto-redacts sensitive data from logs
├── devtools.html          # DevTools entry point
├── devtools.js            # Registers the "API Catcher" DevTools panel
├── panel.html             # Main panel UI (Shared between side panel and DevTools)
├── panel.css              # Panel styles (dark theme)
├── panel.js               # Panel logic
├── popup.html             # Toolbar popup dashboard UI
├── popup.css              # Popup styles
├── popup.js               # Popup logic
├── options.html           # Settings page UI
├── options.js             # Settings page logic (PAT management)
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

## Setup Instructions

### 1. Load the Extension in Chrome

1. Clone or download this repository to your local machine.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** using the toggle in the top-right corner.
4. Click **"Load unpacked"** and select the `api-catcher/` directory.

### 2. Configure GitHub PAT (Optional, for Gist Sharing)

1. Right-click the API Catcher icon → **Options**.
2. Enter your GitHub Personal Access Token (PAT) with the `gist` scope.
3. Click **Save Token**.

## Usage

### Monitoring API Calls

- **Toolbar Popup**: Click the API Catcher icon for a quick, compact dashboard.
- **Side Panel**: Right-click the extension icon and select "Open Side Panel" (or click the icon if configured as default) for a persistent view.
- **DevTools**: Open Chrome DevTools and select the **API Catcher** tab for a wide-screen view.

### Detail View & Sharing

- Click any request in the list to see full headers and bodies.
- Use the **cURL** or **JSON** buttons to copy data.
- Click **Share Gist** to upload a sanitized version of the log to GitHub Gists.

## Privacy & Security

- **Local Storage**: All captured logs are stored in `chrome.storage.session` (in-memory) and are cleared when you close the browser.
- **PAT Encryption**: Your GitHub PAT is stored in `chrome.storage.local`, only accessible to the extension.
- **Auto-Redaction**: Before any data is shared via Gist, the extension recursively scans the payload and redacts common sensitive keys (e.g., `access_token`, `apiKey`, `cookie`).

## License

MIT

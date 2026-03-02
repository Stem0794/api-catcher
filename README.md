# API Catcher

A Manifest V3 Chrome extension for QA testers to monitor, log, and securely share API network activity.

## Features

- **Network Interception** — Captures all XHR and Fetch requests with full details (method, URL, status, headers, body, timing)
- **Side Panel Support** — Opens in the browser's native side panel (sidebar) for persistent, easy access while browsing
- **Initiator Context** — Tracks the page URL and title where each request originated, identifying the exact source of every API call
- **DevTools Panel** — Clean, dark-themed UI integrated into Chrome DevTools with filtering, color-coded statuses, and a resizable split view
- **Copy as cURL / JSON** — One-click export of any request for debugging or sharing
- **GitHub Gist Sharing** — Create a secret Gist from any captured request and auto-copy the shareable link
- **Options Page** — Securely store your GitHub PAT via `chrome.storage.local`

## Project Structure

```
api-catcher/
├── manifest.json          # Extension manifest (MV3)
├── background.js          # Service worker: manages per-tab logs, injects content scripts
├── content.js             # Content script: bridges page world ↔ extension
├── interceptor.js         # Injected into page context: monkey-patches fetch/XHR
├── devtools.html          # DevTools entry point
├── devtools.js            # Registers the "API Catcher" DevTools panel
├── panel.html             # Main panel UI (list + detail views)
├── panel.css              # Panel styles (dark theme)
├── panel.js               # Panel logic: filtering, detail view, clipboard, Gist sharing
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
5. The extension will appear in your extensions list with the name **"API Catcher"**.

### 2. Open the Monitor

1. Navigate to any website (e.g., `https://jsonplaceholder.typicode.com`).
2. **Click the API Catcher icon** in your extensions bar — this opens the **Side Panel** (sidebar) to start monitoring immediately.
3. Alternatively, open **Chrome DevTools** (`F12` or `Ctrl+Shift+I` / `Cmd+Option+I`) and look for the **"API Catcher"** tab.
4. Interact with the page — any XHR or Fetch calls will appear in real time in both the monitor window and DevTools.

### 3. Configure GitHub PAT (for Gist Sharing)

1. Right-click the API Catcher extension icon → **"Options"**, or go to `chrome://extensions/` → API Catcher → **"Details"** → **"Extension options"**.
2. Enter your GitHub Personal Access Token and click **Save Token**.

#### Required GitHub PAT Scopes

| Token Type | Required Scope |
|---|---|
| **Classic token** | Select only the **`gist`** scope |
| **Fine-grained token** | Under **Account permissions**, set **Gists** to **Read and write** |

**To generate a token:**

1. Go to [GitHub → Settings → Developer settings → Personal access tokens](https://github.com/settings/tokens).
2. Click **"Generate new token"**.
3. Select the scope as described above.
4. Set an expiration that suits your workflow.
5. Click **"Generate token"**, copy it, and paste it into the API Catcher Options page.

## Usage

### Viewing Requests

- Open the **API Catcher** tab in DevTools.
- All XHR and Fetch requests from the inspected page will stream in automatically.
- Use the **filter bar** to search by URL or method.
- Use the **Method** and **Status** dropdowns to narrow results.
- Click any row to open the **Detail View** on the right.

### Detail View

The detail panel shows:
- Full URL with method badge
- Status code, duration, and timestamp
- **Initiator Context** — The page title and URL where the request originated
- Collapsible sections for **Request Headers**, **Request Body**, **Response Headers**, and **Response Body**
- JSON payloads are automatically pretty-printed

### Sharing

| Action | Description |
|---|---|
| **Copy cURL** | Copies the selected request as a ready-to-paste `curl` command |
| **Copy JSON** | Copies the full request/response entry as formatted JSON |
| **Share via Gist** | Creates a **secret** GitHub Gist with the entry JSON and copies the Gist URL to your clipboard |
| **Export All** | Copies all currently visible (filtered) logs as a JSON array |

### Color Coding

| Status Range | Color |
|---|---|
| `2xx` | Green |
| `3xx` | Yellow |
| `4xx` | Orange |
| `5xx` | Red |
| `0` (network error) | Red |

Methods are also color-coded: GET (blue), POST (green), PUT (yellow), PATCH (orange), DELETE (red).

## Architecture Decisions

### Why a DevTools Panel and a Side Panel?

API Catcher provides both for maximum flexibility:

1. **Side Panel (Sidebar)** — Best for persistent monitoring while you interact with the page. It stays open as you browse and doesn't clutter your workspace.
2. **DevTools Panel** — Best for deep analysis of large JSON payloads or when you need to see Network/Console logs side-by-side with API Catcher.

A DevTools panel was originally chosen because:
1. **Natural workflow** — QA testers already live in DevTools when debugging.
2. **Larger viewport** — DevTools panels have more screen real estate than a side panel.
3. **Per-tab isolation** — DevTools panels are inherently scoped to the inspected tab.
...
### Security Considerations

- The GitHub PAT is stored in `chrome.storage.local`, which is encrypted at rest by Chrome and is only accessible to this extension.
- The PAT is never exposed in the UI (it's masked after saving).
- Gists are created as **secret** (unlisted) — they are not indexed by search engines but are accessible to anyone with the link.
- The interceptor script runs in the page's MAIN world (required to monkey-patch `fetch`/`XHR`), but communication back to the extension goes through `window.postMessage` with a unique message type.

## Permissions Explained

| Permission | Reason |
|---|---|
| `storage` | Store the GitHub PAT and user preferences |
| `clipboardWrite` | Copy cURL, JSON, and Gist URLs to the clipboard |
| `scripting` | Programmatically inject the content script into tabs |
| `webNavigation` | Detect page navigations to inject the interceptor early |
| `sidePanel` | Support opening the monitor in the browser's native sidebar |
| `tabs` | Identify the active tab to bridge data to the monitor |
| `<all_urls>` (host) | Required to inject scripts and capture requests on any site |

## License

MIT

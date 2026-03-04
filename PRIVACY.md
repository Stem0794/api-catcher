# Privacy Policy for API Catcher

**Effective Date:** March 2, 2026

API Catcher is committed to protecting your privacy. This Privacy Policy explains how our Chrome extension handles data.

## 1. Data Collection and Storage
API Catcher **does not collect, store, or transmit any personal data** to external servers or to the developers of the extension.

- **Network Data:** The extension captures network request and response data (URLs, headers, and bodies) for the sole purpose of displaying them to you in the monitor interface. This data is stored locally in your browser's memory and is cleared when you manually clear the logs or close the inspected tab.
- **Local Storage:** Your GitHub Personal Access Token (PAT) and extension preferences (such as filters) are stored locally on your device using Chrome's `storage.local` API. This data is encrypted at rest by the browser and never leaves your machine.

## 2. Third-Party Services
The extension only interacts with a third-party service if you explicitly choose to use the "Share via Gist" feature.

- **GitHub Gists:** When you click "Share via Gist," the selected request detail is sent directly to the GitHub API (`api.github.com`) using the PAT you provided. This creates a secret Gist on your own GitHub account. No other third-party services are used, and no data is shared with the extension developers.

## 3. Security
Your data is stored locally and is subject to the security measures of the Google Chrome browser. Your GitHub PAT is treated as a sensitive credential and is only used for authenticated requests to GitHub performed on your behalf.

## 4. Changes to This Policy
We may update our Privacy Policy from time to time. Any changes will be reflected in this document within the GitHub repository.

## 5. Contact Us
If you have any questions about this Privacy Policy, please contact us via the GitHub repository issue tracker.

/**
 * devtools.js — Creates the "API Catcher" panel inside Chrome DevTools.
 */
chrome.devtools.panels.create(
  'API Catcher',
  null,
  'panel.html',
  (panel) => {
    // Panel created
  }
);

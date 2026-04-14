# Chrome Extension Bridge

This extension allows the Moodle Analyzer web app to call Moodle APIs through a Chrome extension service worker instead of directly from the page.

## Why it exists

Some Moodle deployments expose invalid CORS headers. A frontend-only SPA cannot fix that from the browser page itself.

The extension acts as a bridge:

1. the React app sends a message to the content script
2. the content script forwards the request to the extension service worker
3. the service worker performs the network request with extension host permissions
4. the result is sent back to the page

## Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `extension/` folder from this repository

## Current page matches

The content script is injected on:

- `http://192.168.31.130/*`
- `http://127.0.0.1/*`
- `http://localhost/*`

If the app is hosted elsewhere, update `manifest.json`.

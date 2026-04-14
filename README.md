# Moodle Student Analyzer Web

Client-side web application that reproduces the core Moodle analysis workflow of the desktop Python project in a React + Vite stack.

## Status

Implemented as a frontend-only SPA.

- No custom backend.
- Data is fetched directly from the Moodle REST API from the browser.
- Connection profiles, UI language, and AI settings are stored locally in the browser.

## Scope

The current web app includes:

- Moodle connection with token or credential-based token generation
- Optional Chrome extension bridge for Moodle requests when browser CORS blocks direct access
- Course listing and selection
- Configurable passing threshold
- Course-wide student analysis
- Student risk classification and recommendations
- Tabbed course and student workspaces to reduce screen overload
- Expanded course and student charts, including engagement distributions, predicted vs actual grades, risk-ranked students, student radar profile, quiz history, submission timing, and weekly activity
- Optional AI-assisted reports through a local OpenAI-compatible endpoint

## Stack

- `react@19.2.5`
- `react-dom@19.2.5`
- `vite@8.0.8`
- `typescript@6.0.2`
- `framer-motion@12.38.0`
- `recharts@3.8.1`
- `lucide-react@1.8.0`

## Constraints

- Browser access depends on the Moodle instance allowing the required REST endpoints and CORS policy.
- Credential-based token generation is only possible when the Moodle site allows browser requests to `login/token.php`.
- Local AI integrations expose requests from the browser directly to the configured endpoint.
- If Moodle returns invalid CORS headers, such as multiple `Access-Control-Allow-Origin` values, this frontend-only app cannot connect. In that case you need either a server-side fix or a backend/proxy.

## Chrome Extension Bridge

The Chrome MV3 extension now lives in the separate project:

- `D:\ProyectosIA\proxy extension`

Use it when:

- the Moodle server has broken CORS headers
- you still want to keep the main app frontend-only

Load it in Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select `D:\ProyectosIA\proxy extension`

Once installed on the same browser/profile as the app, the web UI will detect it automatically and route Moodle API requests through the extension.

If the extension is not installed, the connection screen now shows an explicit installation warning with the required steps.

## Development

Requirements:

- Node.js 22+
- npm 10+

Commands:

```bash
npm install
npm run dev
npm run lint
npm run build
```

Default local execution target:

- Dev server host: `localhost`
- Preview host: `localhost`

Open the app locally with:

```text
http://localhost:5173
```

## Project Structure

- `src/api/moodleClient.ts`: Moodle REST client for browser use.
- `src/analysis/dataCollector.ts`: raw course and student data collection.
- `src/analysis/metrics.ts`: per-student metric computation.
- `src/analysis/courseAnalyzer.ts`: prediction, risk, recommendations, and course aggregates.
- `src/analysis/reportAgent.ts`: optional local AI report generation.
- `src/lib/extensionBridge.ts`: page-to-extension bridge for Chrome MV3.
- `src/App.tsx`: application shell and screens.
- `src/lib/`: storage, formatting, and i18n helpers.

## Repository Management

- Local Git has been initialized.
- GitHub remote creation is currently blocked because no GitHub CLI session or remote URL is available on this machine.

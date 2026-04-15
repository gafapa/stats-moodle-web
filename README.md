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
- White, high-contrast visual theme with a cleaner information hierarchy
- Course listing and selection with a dedicated action card, inline threshold control, and direct double-click analysis
- Configurable passing threshold
- Course-wide student analysis
- Student risk classification and recommendations
- Working UI language switching for shared labels and the main workflow screens
- Tabbed course and student workspaces to reduce screen overload
- Built-in explanations for every analysis block so each chart and summary explains what it measures and how to interpret it
- Expanded course analytics including engagement distributions, predicted vs actual grades, risk-ranked students, top-vs-bottom cohorts, course funnel, forum activity by risk, activity heatmaps, persistence vs consistency, submission punctuality, quiz performance by activity, course activity mix, section workload, completion bottlenecks, resource format distribution, assessment timelines, and assignment grading turnaround
- Expanded student analytics including radar profile, percentile view, quiz history, question-level quiz review, submission timing, weekly activity, activity heatmaps, submission status breakdown, forum interaction breakdown, tracked completion by activity type, grading turnaround per assignment, persistence and consistency indicators, and prediction summaries
- Optional AI-assisted reports through a local OpenAI-compatible endpoint

## Verified Moodle API Coverage

Validated against a live Moodle instance on April 15, 2026:

- Target instance: `https://centros.edu.xunta.gal/iesmontevila/aulavirtual`
- The provided token exposed 467 web service functions through `core_webservice_get_site_info`.
- `core_enrol_get_my_courses` can be sparse or incomplete for some tokens, so the client falls back to `core_enrol_get_users_courses` and then `core_course_get_courses`.
- Verified working read endpoints for analytics included course contents, enrolled users, grade items, activity completion, assignments, assignment grades, submissions, quizzes, attempt review, forums, pages, resources, calendar action events, course modules, analytics contexts, and course grade overview.
- `mod_quiz_get_attempt_review` is now used lazily from the student assessment workspace so the app can inspect question-level outcomes without slowing down the full-course analysis phase.
- Verified live limitations included optional logs (`report_log_get_log` failed on this Moodle service) and course completion criteria (`core_completion_get_course_completion_status` returned `nocriteriaset` when the course did not define course-level completion rules).

See `MOODLE_API_AUDIT.md` for the field-level audit summary used to expand the frontend analytics.

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
- Some Moodle tokens do not return reliable data from `core_enrol_get_my_courses`; the app already falls back to user-course and catalog endpoints to avoid an empty course picker.
- Some Moodle services do not expose logs even when the rest of the course endpoints are available; the app treats logs as optional and keeps analysis working without them.
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
- `src/constants/ui.ts`: shared UI constants such as risk colors and default form values.
- `src/components/common/`: reusable UI building blocks such as tiles, tabs, heatmaps, report panes, dialogs, and loading overlays.
- `src/components/screens/`: top-level application screens split by workflow stage.
- `src/lib/extensionBridge.ts`: page-to-extension bridge for Chrome MV3.
- `src/lib/uiData.ts`: chart-oriented data helpers shared across screens, including funnel, heatmap, cohort, completion, assessment timeline, and grading turnaround datasets.
- `src/App.tsx`: application shell and state orchestration.
- `src/lib/`: storage, formatting, i18n, and shared UI data helpers.
- `MOODLE_API_AUDIT.md`: live Moodle REST audit describing verified endpoints, payload coverage, and known limitations.

## Repository Management

- Local Git is initialized and connected to GitHub.
- Main branch pushes are currently going to `origin/main`.

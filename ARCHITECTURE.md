# Architecture

## Goal

Ship a browser-only Moodle analytics application that ports the analysis pipeline from the Python desktop project to TypeScript.

## Runtime

- React for UI composition
- Vite for development and production bundling
- TypeScript for the application code
- Browser `fetch` for Moodle REST access
- Local storage for user profiles, language, and AI settings

## Main Flows

1. Connection
   - User enters Moodle URL and either a token or username/password.
   - The app validates the session with `core_webservice_get_site_info`.
   - Profiles can be saved locally in the browser.
2. Course selection
   - The app loads user courses or all courses when available.
   - The user sets the passing threshold before analysis.
3. Analysis
   - The app collects Moodle data for the selected course.
   - The TypeScript analyzer computes metrics, predictions, risk levels, and recommendations.
4. Exploration
   - Course dashboard exposes KPIs, distributions, charts, and student list.
   - Student detail shows profile, grades, activity, submissions, quizzes, prediction, and alerts.
5. AI reports
   - Optional local OpenAI-compatible endpoints can generate course and student reports directly from the browser.

## Implemented Modules

- `src/App.tsx`
  - connection view
  - course selection view
  - course dashboard view
  - student detail view
  - AI settings modal
- `src/api/moodleClient.ts`
  - token validation
  - credential-to-token request
  - Moodle REST read-only wrappers
- `src/analysis/dataCollector.ts`
  - course structure, assignments, quizzes, forums, submissions, attempts, logs, and student snapshots
- `src/analysis/metrics.ts`
  - engagement, completion, submissions, quiz, forum, session, and activity metrics
- `src/analysis/courseAnalyzer.ts`
  - heuristic prediction
  - risk assessment
  - student and teacher recommendations
  - course aggregate metrics
- `src/analysis/reportAgent.ts`
  - local OpenAI-compatible markdown reports for course and student scopes
- `src/lib/storage.ts`
  - browser persistence for profiles, language, and AI settings
- `src/lib/i18n.ts`
  - language catalog and label lookup
- `src/lib/format.ts`
  - formatting and markdown download helpers

## Data Persistence

Browser local storage holds:

- connection profiles
- UI language
- AI provider settings

Passwords must never be persisted.

## Security Model

- The application is read-only with respect to Moodle analysis flows.
- Moodle passwords are used only for token generation and kept in memory only for the current action.
- Tokens may be stored locally only when the user saves a profile.
- AI requests are sent directly from the browser to the configured endpoint.

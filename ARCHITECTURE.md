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
   - Course loading tries `core_enrol_get_my_courses`, then falls back to `core_enrol_get_users_courses`, and finally to `core_course_get_courses` when the token does not expose reliable "my courses" data.
   - Profiles can be saved locally in the browser.
   - If the Chrome bridge extension is available, Moodle requests are routed through the extension service worker instead of direct page `fetch`.
2. Course selection
   - The app loads user courses or all courses when available.
   - Course results are enriched with readable category names using `core_course_get_categories` because Moodle course endpoints do not consistently return `categoryname`.
   - The user selects a course and launches analysis from a dedicated action card.
   - Double-click on a course row can trigger analysis directly.
   - The passing threshold is edited next to the primary course action instead of in a detached toolbar.
3. Analysis
   - The app collects Moodle data for the selected course.
   - Collection includes course structure, enrolled users, grade items, tracked completion, assignments, assignment grades, submissions, quizzes, attempts, forums, pages, resources, and logs when the Moodle service exposes them.
   - The TypeScript analyzer computes metrics, predictions, risk levels, and recommendations.
4. Exploration
   - Course dashboard is split into top-level tabs for overview, risk and cohorts, activity, students, and AI reporting.
   - Course analytics tabs use nested sub-tabs to separate distributions, actions, forecast views, cohort comparisons, engagement patterns, course design structure, and assessment flow.
   - Student detail is split into top-level tabs for overview, activity, assessments, prediction, and AI reporting.
   - Student analytics tabs also use nested sub-tabs to separate profile, guidance, rhythm, participation, assessment history, question review, and recorded assessment views.
   - Both views expose a broader chart set based on the available frontend metrics, including heatmaps, cohort comparisons, funnel views, persistence and consistency indicators, submission punctuality breakdowns, quiz-level performance summaries, course activity mix analysis, section workload, completion bottlenecks, resource format distributions, assessment timelines, tracked completion splits, grading turnaround views, and question-level quiz review analytics for student detail.
   - Each analytical block includes a short in-context explanation describing what the metric shows, how to read it, and why it matters.
5. AI reports
   - Optional local OpenAI-compatible endpoints can generate course and student reports directly from the browser.

## Implemented Modules

- `src/App.tsx`
  - application shell
  - top-level state orchestration
  - screen switching
- `src/components/screens/`
  - connection screen
  - course selection screen
  - tabbed course dashboard screen
  - tabbed student detail screen
- `src/components/common/`
  - metric tiles
  - tab navigation
  - chart containers
  - nested sub-tab navigation variants
  - activity heatmap grid
  - inline analysis explanations inside chart surfaces
  - larger chart surfaces for dense comparisons and heatmaps
  - AI settings dialog
  - AI report pane
  - loading overlay
- `src/constants/ui.ts`
  - shared UI constants
- `src/api/moodleClient.ts`
  - token validation
  - credential-to-token request
  - Moodle REST read-only wrappers
  - assignment grades, pages, and resources wrappers
  - automatic transport selection between direct browser fetch and extension bridge
- `src/analysis/dataCollector.ts`
  - course structure, assignments, assignment grades, quizzes, forums, pages, resources, submissions, attempts, logs, and student snapshots
- `src/analysis/metrics.ts`
  - engagement, completion, submissions, quiz, forum, session, and activity metrics
- `src/analysis/quizReview.ts`
  - question-level quiz review aggregation from `mod_quiz_get_attempt_review`
  - weakest reviewed questions, question-type performance, and outcome distributions
- `src/analysis/courseAnalyzer.ts`
  - heuristic prediction
  - risk assessment
  - student and teacher recommendations
  - course aggregate metrics
- `src/analysis/reportAgent.ts`
  - local OpenAI-compatible markdown reports for course and student scopes
- `src/lib/storage.ts`
  - browser persistence for profiles, language, and AI settings
- `src/lib/extensionBridge.ts`
  - page-side messaging transport to the Chrome extension
- `src/lib/uiData.ts`
  - chart-oriented data helpers
  - shared numeric parsers and aggregation helpers
  - heatmap, funnel, forum, cohort, section workload, completion bottleneck, resource format, assessment timeline, and grading turnaround dataset builders
- `src/lib/i18n.ts`
  - language catalog and label lookup for the main application workflow
- `src/lib/format.ts`
  - formatting and markdown download helpers
- external project: `D:\ProyectosIA\proxy extension`
  - MV3 manifest
  - content script bridge
  - service worker proxy transport

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

## Live API Findings

- The current implementation treats logs as optional because some Moodle mobile services expose the rest of the analytics endpoints but reject `report_log_get_log`.
- Course completion criteria are also optional. When a course does not define course-level completion rules, `core_completion_get_course_completion_status` can return `nocriteriaset`, so the application relies on activity-level completion instead.
- Quiz attempt review is available and useful, but it is fetched lazily in the student detail assessments tab to avoid multiplying request volume during whole-course analysis.

# Moodle API Audit

## Scope

This document records the live Moodle REST audit used to expand the analytics coverage of the web application.

- Validation date: April 15, 2026
- Target instance: `https://centros.edu.xunta.gal/iesmontevila/aulavirtual`
- Authentication mode: existing token provided by the user
- Goal: verify which read-only Moodle endpoints are available through the token, inspect the payload shapes, and map them to reliable frontend analytics

## Verified Endpoint Coverage

The token returned 467 functions from `core_webservice_get_site_info`.

### Connection and course discovery

- `core_webservice_get_site_info`
  - verified user identity, site URL, and service function catalog
- `core_enrol_get_users_courses`
  - returned the current user's enrolled course list reliably
- `core_course_get_courses`
  - returned the visible catalog and was used as a final fallback
- `core_enrol_get_my_courses`
  - may return sparse or incomplete data for some tokens, so it must not be the only discovery path

### Course structure and participants

- `core_course_get_contents`
  - returned sections, course-module ids, activity names, module types, visibility, completion flags, embedded resource files, and section placement
- `core_enrol_get_enrolled_users`
  - returned course participants and role assignments
- `core_user_get_course_user_profiles`
  - remains useful for enriching users when role data is incomplete
- `core_course_get_course_module`
  - returned section number, pass grade, completion settings, and advanced grading metadata for a course module

### Assessment and gradebook

- `gradereport_user_get_grade_items`
  - returned per-user gradebook items with raw grades, maximum grade, grading timestamps, feedback, module type, and course total
- `gradereport_overview_get_course_grades`
  - returned compact per-course grade overview for a user
- `mod_assign_get_assignments`
  - returned assignment configuration, due dates, grade maximum, timing flags, and submission settings
- `mod_assign_get_submissions`
  - returned per-assignment submission records with status and timestamps
- `mod_assign_get_grades`
  - returned per-assignment grade rows with grader, grade value, and grading timestamps
- `mod_assign_get_submission_status`
  - returned detailed feedback, grading status, and last-attempt data for a user on a specific assignment
- `mod_quiz_get_quizzes_by_courses`
  - returned quiz configuration such as attempts, time limits, open and close dates, maximum grade, and question availability
- `mod_quiz_get_user_attempts`
  - returned attempt state, start and finish times, and raw quiz scores
- `mod_quiz_get_attempt_review`
  - returned question-level review payloads for finished attempts

### Completion, content, and supporting context

- `core_completion_get_activities_completion_status`
  - returned per-user completion states by `cmid`, completion timestamps, automatic/manual tracking flags, and completion rules
- `mod_page_get_pages_by_courses`
  - returned inline page content and metadata
- `mod_resource_get_resources_by_courses`
  - returned downloadable files with filename, mimetype, file size, and modification time
- `mod_forum_get_forums_by_courses`
  - returned forum definitions and completion thresholds
- `mod_forum_get_forum_discussions`
  - returned discussion lists
- `mod_forum_get_forum_discussion_posts`
  - remains the post-level source for per-user forum participation
- `core_calendar_get_action_events_by_course`
  - returned dated action events, overdue flags, course metadata, and linked activity information
- `tool_analytics_potential_contexts`
  - returned contexts that can feed Moodle analytics models

## Verified Limitations

- `report_log_get_log`
  - on this Moodle service, the endpoint returned an error instead of log rows
  - implication: the application must keep logs optional and continue analysis without them
- `core_completion_get_course_completion_status`
  - returned `nocriteriaset` when the course did not define course-level completion criteria
  - implication: activity-level completion is the stable baseline, not course-level completion
- `core_grades_get_gradeitems`
  - the naive per-user call returned `invalidparameter`
  - implication: the current app should keep using `gradereport_user_get_grade_items` for student-level gradebook analysis
- some course-level assessment endpoints can return warnings when the token can see the course catalog but lacks the specific capability for a given course

## Payloads That Directly Power New Analytics

### Section workload

Source data:

- `core_course_get_contents`

Useful fields:

- section name
- section number
- module id
- module type
- visibility

Derived analytics:

- modules per section
- assessed vs content-oriented activities per section
- overloaded section detection

### Completion bottlenecks

Source data:

- `core_completion_get_activities_completion_status`
- `core_course_get_contents`

Useful fields:

- `cmid`
- `modname`
- `state`
- `timecompleted`
- activity name lookup from course contents

Derived analytics:

- lowest completion-rate activities across the class
- tracked activity completion splits for an individual student

### Resource format distribution

Source data:

- `mod_resource_get_resources_by_courses`

Useful fields:

- `filename`
- `mimetype`
- `filesize`
- `timemodified`

Derived analytics:

- file-format mix
- downloadable resource footprint
- media reliance profile

### Assessment timeline

Source data:

- `mod_assign_get_assignments`
- `mod_quiz_get_quizzes_by_courses`
- optional validation from `core_calendar_get_action_events_by_course`

Useful fields:

- assignment due dates
- quiz open and close dates

Derived analytics:

- weekly deadline clustering
- assessment workload peaks

### Grading turnaround

Source data:

- `mod_assign_get_submissions`
- `mod_assign_get_grades`

Useful fields:

- submission timestamps
- grading timestamps
- raw grades
- assignment maximum grade

Derived analytics:

- average grading delay by assignment
- per-student grading turnaround by assignment
- average score side channel for graded work

## Current Product Decisions Based on the Audit

- Keep course loading resilient by falling back from `core_enrol_get_my_courses` to `core_enrol_get_users_courses` and then to the full catalog.
- Keep logs optional in both data collection and UI messaging.
- Prefer activity-level completion over course-level completion because it is more consistently available.
- Use assignment-grade timestamps instead of guessing grading speed from gradebook rows alone.
- Collect pages and resources explicitly because they expose richer content metadata than course contents alone.

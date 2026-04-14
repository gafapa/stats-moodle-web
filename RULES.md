# Repository Rules

## Language

- Use English for code identifiers.
- Use English for Markdown documentation.
- Use English for code comments and Git commit messages.

## Documentation Sync

- Update `README.md` when setup steps, capabilities, or delivery constraints change.
- Update `ARCHITECTURE.md` when modules, flows, or persistence rules change.
- Keep behavior and documentation aligned at all times.

## Security

- Do not persist Moodle passwords.
- Store tokens only in explicit saved profiles.
- Keep Moodle interactions read-only for analysis.
- Treat browser-side AI settings as local-only configuration.

## Engineering

- Prefer small, composable TypeScript modules over large components.
- Keep analysis logic independent from UI components.
- Validate browser-facing inputs and surface actionable error states.

## Verification

- Run a production build before closing implementation work when feasible.
- Run lint before closing implementation work when feasible.
- Add automated tests when introducing stable business logic that benefits from regression coverage.

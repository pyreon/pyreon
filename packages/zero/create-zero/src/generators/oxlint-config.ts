/**
 * `.oxlintrc.json` for a lint-enabled scaffold — the size-limit half of the
 * readable setup, extending the preset `@pyreon/lint` ships.
 *
 * Generated rather than kept as a file under `templates/_shared/_lint/`:
 * oxlint discovers NESTED config files while linting a tree, so a template
 * `.oxlintrc.json` is read by this repository's own `oxlint .` run, and its
 * `./node_modules/...` `extends` path does not exist inside the template
 * directory. Writing it at scaffold time keeps the repo's lint run clean.
 */
export function generateOxlintConfig(): string {
  // Written as oxfmt lays it out (short arrays on one line), so the
  // project's first `bun run format` leaves it alone.
  return `{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "extends": ["./node_modules/@pyreon/lint/oxlint/readable.json"],
  "ignorePatterns": ["dist", ".zero"]
}
`
}

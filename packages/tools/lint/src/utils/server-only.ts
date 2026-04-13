/**
 * File-path patterns for server-only packages — code that runs in Node
 * (build-time plugins, CLI tools, server entries) where:
 *   - `process` is always defined (so `typeof process` is fine)
 *   - `__DEV__` / `import.meta.env.DEV` aren't conventionally available, and
 *     dev/prod is `process.env.NODE_ENV` instead
 *   - User-facing `console.error`/`console.warn` from CLI commands is the
 *     intended UX, not a dev hint
 *
 * Architecture rules that target browser-runtime patterns
 * (`pyreon/no-process-dev-gate`, `pyreon/dev-guard-warnings`, etc.) skip
 * any file whose path matches one of these patterns.
 *
 * Patterns intentionally do NOT start with `/` so they match both absolute
 * (`/Users/.../packages/zero/...`) and relative (`packages/zero/...`) paths —
 * different lint runners pass paths differently.
 */
export const SERVER_PACKAGE_PATTERNS = [
  'packages/zero/',
  'packages/core/server/',
  'packages/core/runtime-server/',
  'packages/tools/vite-plugin/',
  'packages/tools/cli/',
  'packages/tools/lint/',
  'packages/tools/mcp/',
  'packages/tools/storybook/',
  'packages/tools/typescript/',
  'scripts/',
]

export function isServerOnlyFile(filePath: string): boolean {
  return SERVER_PACKAGE_PATTERNS.some((pat) => filePath.includes(pat))
}

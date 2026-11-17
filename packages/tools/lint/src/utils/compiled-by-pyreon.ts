import { isProjectDependency } from './project-deps'

const TEST_FILE = /(?:\.(?:test|spec)\.[cm]?[jt]sx?$)|(?:\/__tests__\/)/

/** A compat project hands its JSX to the compat runtime, not the Pyreon compiler. */
const COMPAT_PACKAGES = [
  '@pyreon/react-compat',
  '@pyreon/preact-compat',
  '@pyreon/vue-compat',
  '@pyreon/solid-compat',
  '@pyreon/svelte-compat',
]

const FOREIGN_JSX_PRAGMA = /@jsxImportSource\s+(?!@pyreon\/core\b)\S+/

/**
 * Whether the Pyreon JSX compiler lowers this file, as far as a linter can
 * tell. It does not for test files (vitest's own JSX transform), for a project
 * that depends on a compat layer, or under a foreign `@jsxImportSource`.
 *
 * The answer decides what a signal read in JSX means. Compiled, `{count}` and
 * `<Comp x={count()} />` are both reactive (auto-call; `_rpd`). Not compiled, a
 * bare `{count}` child is a live accessor while `{count()}` and `x={count()}`
 * are read once.
 */
export function isCompiledByPyreon(filePath: string, source: string): boolean {
  const file = filePath.replace(/\\/g, '/')
  if (TEST_FILE.test(file) || FOREIGN_JSX_PRAGMA.test(source)) return false
  return !COMPAT_PACKAGES.some((pkg) => isProjectDependency(file, pkg))
}

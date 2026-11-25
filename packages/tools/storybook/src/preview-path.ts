import { fileURLToPath } from 'node:url'

// Scheme-guarded because the preset must stay TOTAL in every ESM environment: Storybook
// loads the built file with a real `file:` URL, but transform pipelines
// (vitest serves modules over its own scheme) hand out non-file URLs, where
// `fileURLToPath` THROWS at module eval — the same "works shipped, dies in
// another loader" fragility class the preset was cured of, inverted.
/**
 * The preview path a loader will accept, for either URL scheme.
 *
 * A separate module (off the `./preset` entry, reached by tests through
 * `@pyreon/storybook/internal`) so BOTH arms are testable from source. Under vitest the
 * module's own `import.meta.url` is always vitest's scheme, so the `file:`
 * arm — the one that runs in every shipped Storybook — is unreachable from a
 * source test; it is exercised only by `shipped-preset.test.ts`, which loads
 * the built artifact. A branch whose production arm can only be reached
 * through a different artifact is one nobody can reason about locally.
 *
 * @internal
 */
export function previewPathFor(url: URL): string {
  return url.protocol === 'file:' ? fileURLToPath(url) : url.pathname
}

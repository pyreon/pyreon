/**
 * Resilient changelog generator — wraps @changesets/changelog-github with a
 * graceful-degradation fallback.
 *
 * Why: `version-packages` DIED on the 0.32.0 release cut — with 80 pending
 * changesets, @changesets/get-github-info batches every changeset commit
 * into ONE GraphQL query and GitHub's API rejects it with "Timeout on
 * validation of query" (size-driven, deterministic — retries don't help).
 * The Version PR then can never refresh and the whole release pipeline is
 * blocked by a CHANGELOG NICETY.
 *
 * Shape: try the github changelog (PR links, author thanks); on ANY error
 * fall back to the changeset summary line with the short commit hash —
 * the same information `@changesets/changelog-git` would give. A release
 * must never be blocked by changelog decoration (same philosophy as
 * publish.ts's warn-skip on unbootstrapped packages).
 */
const github = require('@changesets/changelog-github')

/** @type {(fn: Function, fallback: Function) => Function} */
const withFallback = (fn, fallback) =>
  async function resilient(...args) {
    try {
      return await fn(...args)
    } catch (err) {
      // One warn per failure type is enough signal; the release proceeds.
      console.warn(
        `[resilient-changelog] github changelog enrichment failed (${
          err && err.message ? String(err.message).slice(0, 120) : 'unknown'
        }) — falling back to plain changelog lines.`,
      )
      return fallback(...args)
    }
  }

/** Plain-line fallbacks — changeset summary + short commit hash. */
async function plainReleaseLine(changeset) {
  const [firstLine, ...rest] = changeset.summary.split('\n').map((l) => l.trimEnd())
  const commit = changeset.commit ? ` (${changeset.commit.slice(0, 7)})` : ''
  let line = `- ${firstLine}${commit}`
  if (rest.length > 0) line += `\n${rest.map((l) => `  ${l}`).join('\n')}`
  return line
}

async function plainDependencyReleaseLine(changesets, dependenciesUpdated) {
  if (dependenciesUpdated.length === 0) return ''
  const updated = dependenciesUpdated.map((d) => `  - ${d.name}@${d.newVersion}`).join('\n')
  return `- Updated dependencies:\n${updated}`
}

const base = github.default ?? github

module.exports = {
  default: {
    getReleaseLine: withFallback(
      (...args) => base.getReleaseLine(...args),
      plainReleaseLine,
    ),
    getDependencyReleaseLine: withFallback(
      (...args) => base.getDependencyReleaseLine(...args),
      plainDependencyReleaseLine,
    ),
  },
}

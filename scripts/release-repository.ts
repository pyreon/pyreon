/** Repository identity required by npm provenance for this release pipeline. */
export const RELEASE_REPOSITORY_URL = 'https://github.com/pyreon/pyreon'

/**
 * Match the complete GitHub repository, preserving owner/repository case.
 * npm accepts HTTPS, Git/SSH URLs and GitHub shorthand in package metadata.
 * A substring check also accepts forks, other hosts and repository subpaths,
 * which npm rejects against the workflow's provenance after publishing starts.
 */
export function isReleaseRepository(repository: unknown): boolean {
  const url =
    typeof repository === 'string'
      ? repository
      : repository !== null && typeof repository === 'object' && 'url' in repository
        ? repository.url
        : undefined
  if (typeof url !== 'string') return false

  return /^(?:(?:git\+)?(?:https?|git):\/\/github\.com\/|(?:git\+)?ssh:\/\/(?:git@)?github\.com\/|git@github\.com:|github:)?pyreon\/pyreon(?:\.git)?\/?$/.test(
    url,
  )
}

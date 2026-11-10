/**
 * The one funnel for MCP tool arguments that reach the filesystem or `git`.
 *
 * A tool's arguments are written by a model that may be processing untrusted
 * text, so they are attacker-influenced. Two rules hold for every such tool:
 *
 * 1. A path argument must resolve — after following symlinks — inside the
 *    project root (the server's working directory). Without that, a tool that
 *    reads a file and echoes a parse error leaks any file the process can read.
 * 2. A git revision must look like a revision: never starting with `-` (git
 *    would parse it as an option — `--output=<file>` makes `git show` write a
 *    file) and restricted to the ref/revision charset. The argv also carries
 *    `--end-of-options` before it, so git itself refuses to read it as an option.
 */
import { existsSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'

/** Real path of `p`, or of its deepest existing ancestor joined with the rest. */
function realpathLoose(p: string): string {
  if (existsSync(p)) return realpathSync(p)
  const parent = dirname(p)
  if (parent === p) return p
  return resolve(realpathLoose(parent), relative(parent, p))
}

/**
 * Resolve `p` against `root` and return the absolute path, or throw a
 * `[Pyreon]` error when it resolves (through symlinks) outside `root`.
 */
export function resolveInsideProject(root: string, p: string): string {
  const abs = isAbsolute(p) ? p : resolve(root, p)
  const realRoot = realpathLoose(root)
  const real = realpathLoose(abs)
  if (real !== realRoot && !real.startsWith(realRoot.endsWith(sep) ? realRoot : realRoot + sep)) {
    throw new Error(
      `[Pyreon] mcp: \`${p}\` is outside the project root (${root}). Pass a path inside the project, or start the MCP server from the directory that contains it.`,
    )
  }
  return abs
}

/** A git revision: no leading `-`, only the characters refs and revision suffixes use. */
const GIT_REVISION = /^[\w@][\w@./~^{}+-]*$/

export interface GitRevSpec {
  rev: string
  path: string
}

/**
 * Parse `<rev>:<path>`. Returns `undefined` when `spec` does not have that
 * shape, and throws a `[Pyreon]` error when it does but the revision is not a
 * safe revision (e.g. it starts with `-`).
 */
export function parseGitRevSpec(spec: string): GitRevSpec | undefined {
  const m = /^([^:]{2,}):(.+)$/.exec(spec)
  if (!m) return undefined
  const rev = m[1] as string
  if (!GIT_REVISION.test(rev)) {
    throw new Error(
      `[Pyreon] mcp: \`${rev}\` is not a git revision. Use a branch, tag, commit or revision expression such as \`main\`, \`v1.2.0\` or \`HEAD~1\`.`,
    )
  }
  return { rev, path: m[2] as string }
}

/** The `git show` argv for a validated spec — `--end-of-options` keeps git from reading it as a flag. */
export function gitShowArgs(spec: GitRevSpec): string[] {
  return ['show', '--end-of-options', `${spec.rev}:${spec.path}`]
}

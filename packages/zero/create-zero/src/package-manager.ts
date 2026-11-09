/**
 * The package manager the scaffolder was invoked through, read from
 * `npm_config_user_agent`, which npm, pnpm, yarn and bun all set for a
 * `create` / `npx` / `dlx` / `bunx` run (`"pnpm/9.12.0 npm/? node/v22.11.0 darwin arm64"`).
 *
 * The next-steps note used to print `bun install` / `bun run dev` even for
 * `npm create @pyreon/zero`, telling an npm user to install a tool they had
 * not chosen. An unknown or missing agent (the bin run directly) keeps bun,
 * the toolchain the templates are written for.
 */

export type PackageManager = 'bun' | 'npm' | 'pnpm' | 'yarn'

const KNOWN: ReadonlySet<string> = new Set<PackageManager>(['bun', 'npm', 'pnpm', 'yarn'])

export function detectPackageManager(userAgent: string | undefined): PackageManager {
  const name = userAgent?.trim().split(/\s+/)[0]?.split('/')[0] ?? ''
  return KNOWN.has(name) ? (name as PackageManager) : 'bun'
}

/**
 * The commands that take a freshly scaffolded project to a running dev server.
 * The monorepo template's root scripts call `bun run --filter`, so it needs bun
 * whichever tool created it.
 */
export function nextSteps(dir: string, pm: PackageManager, template: string): string[] {
  const tool: PackageManager = template === 'monorepo' ? 'bun' : pm
  const dev = tool === 'npm' || tool === 'bun' ? `${tool} run dev` : `${tool} dev`
  return [`cd ${dir}`, `${tool} install`, dev]
}

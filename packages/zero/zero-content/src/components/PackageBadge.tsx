import type { VNodeChild } from '@pyreon/core'

// ─── <PackageBadge> — npm package install card (PR-K audit H2) ────────────
//
// Renders a small panel showing a package name, optional version, and
// one or more install commands (one per package manager). Static —
// no network calls, no runtime resolution. Authors typically place
// this at the top of an integration / migration page.
//
// Example:
//
//     <PackageBadge
//       name="@pyreon/zero-content"
//       version="0.2.0"
//       managers={{ bun: 'add', npm: 'install', pnpm: 'add', yarn: 'add' }}
//     />

export type PackageManager = 'bun' | 'npm' | 'pnpm' | 'yarn' | 'deno'

export interface PackageBadgeProps {
  /** Package name (e.g. `@pyreon/zero-content`). */
  name: string
  /** Optional version label rendered next to the name. */
  version?: string
  /** Optional one-line description shown under the name. */
  description?: string
  /** Per-manager command verb (default: `bun: add`, `npm: install`,
   *  `pnpm: add`, `yarn: add`, `deno: install`). Omit a manager to
   *  hide its row entirely. */
  managers?: Partial<Record<PackageManager, string>>
  /** Hide the install command block (just show the name + version). */
  hideInstall?: boolean
}

const DEFAULT_MANAGERS: Record<PackageManager, string> = {
  bun: 'add',
  npm: 'install',
  pnpm: 'add',
  yarn: 'add',
  deno: 'install',
}

const ORDER: PackageManager[] = ['bun', 'npm', 'pnpm', 'yarn', 'deno']

/**
 * Resolve the rendered install rows from the supplied managers
 * configuration. Pure — exported for testing.
 *
 * @internal exported for testing
 */
export function renderInstallRows(
  name: string,
  managers: Partial<Record<PackageManager, string>> | undefined,
): Array<{ manager: PackageManager; command: string }> {
  const effective = managers ?? DEFAULT_MANAGERS
  const rows: Array<{ manager: PackageManager; command: string }> = []
  for (const m of ORDER) {
    const verb = effective[m]
    if (typeof verb !== 'string' || verb.length === 0) continue
    rows.push({ manager: m, command: `${m} ${verb} ${name}` })
  }
  return rows
}

export function PackageBadge(props: PackageBadgeProps): VNodeChild {
  const rows = renderInstallRows(props.name, props.managers)
  return (
    <div class="pyreon-pkgbadge">
      <div class="pyreon-pkgbadge__header">
        <span class="pyreon-pkgbadge__name">{props.name}</span>
        {props.version && (
          <span class="pyreon-pkgbadge__version">v{props.version}</span>
        )}
      </div>
      {props.description && (
        <p class="pyreon-pkgbadge__description">{props.description}</p>
      )}
      {!props.hideInstall && rows.length > 0 && (
        <div class="pyreon-pkgbadge__install">
          {rows.map((r) => (
            <div class="pyreon-pkgbadge__row" data-manager={r.manager}>
              <span class="pyreon-pkgbadge__manager">{r.manager}</span>
              <code class="pyreon-pkgbadge__command">{r.command}</code>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

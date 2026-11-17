import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The repo's native example hosts, in both layouts: `examples/native-<app>-ios`
 * / `-android` (one package per platform) and `examples/native-<app>/ios` /
 * `android` (one package per app, the layout this package scaffolds).
 *
 * The same listing as `scripts/native-example-hosts.ts`, restated here because
 * this package's tsconfig cannot reach files outside `src/`. The test-utils
 * suite asserts the two agree on the real repo, so they cannot drift apart.
 */
export function exampleHostDirs(repoRoot: string, platform: 'ios' | 'android'): string[] {
  const examples = join(repoRoot, 'examples')
  const project = platform === 'ios' ? 'project.yml' : 'settings.gradle.kts'
  const out: string[] = []
  for (const name of readdirSync(examples)) {
    if (!statSync(join(examples, name)).isDirectory()) continue
    if (new RegExp(`^native-.+-${platform}$`).test(name)) out.push(`examples/${name}`)
    else if (name.startsWith('native-') && existsSync(join(examples, name, platform, project)))
      out.push(`examples/${name}/${platform}`)
  }
  return out.sort()
}

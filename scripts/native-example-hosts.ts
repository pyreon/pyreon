/**
 * Every native example HOST (an iOS or Android project the device lanes can
 * build), in either of the two layouts `examples/` holds:
 *
 *   split   `examples/native-<app>-ios/`, `examples/native-<app>-android/`:
 *           one package per platform, each with its own `scripts/build.sh`.
 *   single  `examples/native-<app>/ios/`, `examples/native-<app>/android/`:
 *           one package per app, the layout `create-multiplatform` scaffolds,
 *           with `scripts/build-ios.sh` / `scripts/build-android.sh` at the app
 *           root.
 *
 * Scripts that walked `examples/` matching `native-*-ios` by directory name
 * silently missed a single-layout app. They share this one listing instead,
 * so a layout change is one edit here.
 */
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

export type NativePlatform = 'ios' | 'android'

export interface NativeHost {
  /** The key the device lanes select by (`tasks`, `router-demo`, `showcase`). */
  app: string
  platform: NativePlatform
  /** Repo-relative host project directory, no trailing slash. */
  dir: string
  /** Repo-relative app root: the package that owns the host. */
  appRoot: string
  /** Repo-relative PMTC emit script the host's build runs first. */
  buildScript: string
  layout: 'split' | 'single'
}

const SPLIT = /^native-(.+)-(ios|android)$/
const SINGLE = /^native-(.+)$/
/** A directory is a platform host only when it carries that platform's project file. */
const PROJECT_FILE: Record<NativePlatform, string> = {
  ios: 'project.yml',
  android: 'settings.gradle.kts',
}

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

/** Every native host under `<repoRoot>/examples`, sorted by directory. */
export function listNativeHosts(repoRoot: string): NativeHost[] {
  const examples = join(repoRoot, 'examples')
  const out: NativeHost[] = []
  for (const name of readdirSync(examples).sort()) {
    if (!isDir(join(examples, name))) continue
    const split = SPLIT.exec(name)
    if (split) {
      const dir = `examples/${name}`
      out.push({
        app: split[1]!,
        platform: split[2] as NativePlatform,
        dir,
        appRoot: dir,
        buildScript: `${dir}/scripts/build.sh`,
        layout: 'split',
      })
      continue
    }
    const single = SINGLE.exec(name)
    if (!single) continue
    for (const platform of ['ios', 'android'] as const) {
      const hostDir = join(examples, name, platform)
      if (!existsSync(join(hostDir, PROJECT_FILE[platform]))) continue
      out.push({
        app: single[1]!,
        platform,
        dir: `examples/${name}/${platform}`,
        appRoot: `examples/${name}`,
        buildScript: `examples/${name}/scripts/build-${platform}.sh`,
        layout: 'single',
      })
    }
  }
  return out.sort((a, b) => a.dir.localeCompare(b.dir))
}

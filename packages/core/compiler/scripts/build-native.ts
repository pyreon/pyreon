/**
 * Build the @pyreon/compiler Rust native binary (`pyreon-compiler.node`).
 *
 * Why this script exists:
 *
 * 1. **Cargo's bare-repo discovery rejects in-tree builds.** Pyreon's main
 *    repo is configured with `core.bare = true` (worktree-based development).
 *    Cargo walks UP from the crate's `Cargo.toml` looking for `.git` to use
 *    for VCS fingerprinting; it errors with "did not expect repo at .git
 *    to be bare" the moment it sees the bare config. There's no env-var
 *    workaround in cargo for this. The fix is to copy the crate sources to
 *    a directory OUTSIDE the worktree and run `cargo build` there, then
 *    copy the produced shared library back into the package.
 *
 * 2. **The artifact extension differs by platform.** Cargo emits
 *    `libpyreon_compiler_native.dylib` (macOS), `.so` (Linux), or `.dll`
 *    (Windows). The loader in `src/jsx.ts` expects `pyreon-compiler.node`
 *    (the standard Node.js native-module convention). We rename on copy.
 *
 * 3. **Cargo absence is not a failure.** Many consumers don't have the
 *    Rust toolchain installed; the loader handles that gracefully via the
 *    JS fallback path. This script must therefore exit 0 with a warning
 *    when `cargo` isn't on the PATH.
 *
 * 4. **mtime-skip when the binary is fresh.** Bootstrap runs on every
 *    `bun install`. A fresh binary should be a no-op. We skip when
 *    `pyreon-compiler.node` exists AND is newer than every `.rs` source
 *    + `Cargo.toml` + `Cargo.lock`. Same drift-detection shape as
 *    `scripts/bootstrap.ts`.
 *
 * Phase 4 of the Rust-compiler-to-production roadmap (`.claude/plans/`)
 * replaces this script with napi-rs CLI for cross-platform pre-built
 * binaries. Until then, this script is the local-build path.
 */

import { execSync, spawnSync } from 'node:child_process'
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PACKAGE_DIR = dirname(__dirname) // packages/core/compiler/
const NATIVE_DIR = join(PACKAGE_DIR, 'native')
const OUTPUT_PATH = join(NATIVE_DIR, 'pyreon-compiler.node')

const PLATFORM_EXT: Record<string, string> = {
  darwin: 'dylib',
  linux: 'so',
  win32: 'dll',
}
const PLATFORM_LIB_PREFIX: Record<string, string> = {
  darwin: 'lib',
  linux: 'lib',
  win32: '', // Windows .dll has no `lib` prefix
}

function hasCargo(): boolean {
  const r = spawnSync('cargo', ['--version'], {
    stdio: 'ignore',
    timeout: 5_000,
  })
  return r.status === 0
}

/** Walk a directory recursively and collect the maximum mtime across `.rs` / `.toml` / `.lock` files. */
function maxRustSourceMtime(dir: string): number {
  let max = 0
  function walk(d: string): void {
    let entries: ReturnType<typeof readdirSync>
    try {
      entries = readdirSync(d, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name === 'target' || entry.name === '.git' || entry.name.startsWith('.')) continue
      const p = join(d, entry.name)
      if (entry.isDirectory()) {
        walk(p)
        continue
      }
      const lower = entry.name.toLowerCase()
      if (!lower.endsWith('.rs') && !lower.endsWith('.toml') && !lower.endsWith('.lock')) continue
      try {
        const m = statSync(p).mtimeMs
        if (m > max) max = m
      } catch {
        // ignore
      }
    }
  }
  walk(dir)
  return max
}

function isBinaryFresh(): boolean {
  if (!existsSync(OUTPUT_PATH)) return false
  let binMtime: number
  try {
    binMtime = statSync(OUTPUT_PATH).mtimeMs
  } catch {
    return false
  }
  const srcMtime = maxRustSourceMtime(NATIVE_DIR)
  // 2s tolerance covers filesystem mtime quirks (matches bootstrap.ts).
  return binMtime > srcMtime + 2_000
}

function buildOutOfTree(): void {
  const ext = PLATFORM_EXT[process.platform]
  const prefix = PLATFORM_LIB_PREFIX[process.platform]
  if (!ext || prefix === undefined) {
    // oxlint-disable-next-line no-console
    console.warn(
      `[build-native] Unsupported platform: ${process.platform} — skipping (JS fallback will be used).`,
    )
    return
  }

  const tmpRoot = mkdtempSync(join(tmpdir(), 'pyreon-compiler-native-'))
  // Cargo target dir lives OUTSIDE the bare-repo worktree to avoid the
  // "did not expect repo at .git to be bare" error. Reusing across
  // invocations would be nice for incremental builds, but `mkdtemp` is
  // simplest and the build is fast (~10s on a warm cache).
  const buildDir = join(tmpRoot, 'native')
  try {
    mkdirSync(tmpRoot, { recursive: true })
    cpSync(NATIVE_DIR, buildDir, {
      recursive: true,
      filter: (src) => {
        const base = src.split('/').pop() ?? ''
        return base !== 'target' && base !== 'pyreon-compiler.node'
      },
    })

    execSync('cargo build --release', {
      cwd: buildDir,
      stdio: 'inherit',
      timeout: 300_000, // 5 min max
    })

    const builtName = `${prefix}pyreon_compiler_native.${ext}`
    const builtPath = join(buildDir, 'target', 'release', builtName)
    if (!existsSync(builtPath)) {
      throw new Error(`expected built artifact at ${builtPath}, not found`)
    }
    copyFileSync(builtPath, OUTPUT_PATH)
    // oxlint-disable-next-line no-console
    console.log(`[build-native] Built ${OUTPUT_PATH}`)
  } finally {
    try {
      rmSync(tmpRoot, { recursive: true, force: true })
    } catch {
      // best-effort cleanup; macOS sometimes holds .lock files briefly
    }
  }
}

function main(): void {
  if (!hasCargo()) {
    // oxlint-disable-next-line no-console
    console.warn(
      '[build-native] cargo not found — skipping native build. The JS fallback will be used at runtime (3.7-8.9× slower but functionally identical). Install Rust via https://rustup.rs to build the native binary.',
    )
    return
  }

  if (isBinaryFresh()) {
    // No-op fast path. Same shape as bootstrap.ts mtime walk.
    return
  }

  try {
    buildOutOfTree()
  } catch (err) {
    // Soft-fail. JS fallback always works; binary is a perf optimization
    // and not a correctness requirement. Same rationale as the
    // git-hooks install in scripts/bootstrap.ts (fail-open during
    // postinstall — never abort `bun install` for an optional artifact).
    // oxlint-disable-next-line no-console
    console.warn(
      `[build-native] Native build failed: ${err instanceof Error ? err.message : String(err)}. JS fallback will be used.`,
    )
  }
}

main()

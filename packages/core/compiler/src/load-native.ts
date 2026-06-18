/**
 * Native binding loader — resolves the @pyreon/compiler napi-rs binary
 * via two paths in priority order:
 *
 *   1. **In-tree binary** at `<package>/native/pyreon-compiler.node`.
 *      Populated by `scripts/build-native.ts` during local development
 *      (Phase 2). Faster path because it skips npm-package resolution.
 *
 *   2. **Per-platform npm package** (Phase 5b — not active until per-
 *      platform packages are published). Resolves `@pyreon/compiler-
 *      <platform>-<arch>[-<libc>]` via the standard Node module
 *      resolution algorithm. End users on machines without a local
 *      `cargo` install will hit this path: `bun install` resolves
 *      `optionalDependencies` to the matching per-platform package and
 *      this loader picks it up.
 *
 *   3. **JS fallback** (caller's responsibility) — if both paths fail,
 *      `loadNativeBinding()` returns `null` and the caller uses the
 *      pure-JS implementation. Slower but correctness-equivalent.
 *
 * Platform detection follows the napi-rs convention. Linux variants
 * include a `libc` suffix (`gnu` for glibc, `musl` for musl) per
 * https://napi.rs/docs/cli/build#deployment.
 *
 * The two-path resolution lets dev-mode (where `cargo build` produced
 * an in-tree binary) and production-mode (where the user has only the
 * published per-platform package) coexist with no flag flipping.
 */

import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

export interface NativeBinding {
  transformJsx: (
    code: string,
    filename: string,
    ssr: boolean,
    knownSignals: string[] | null,
    reactivityLens: boolean,
    // Optional rocketstyle-collapse config (napi array/Record shape). `unknown`
    // here keeps load-native config-free; jsx.ts casts transformJsx to the
    // precisely-typed NativeTransformFn at the call site.
    collapse?: unknown,
  ) => unknown
}

// Local Node-process surface. `@pyreon/runtime-dom` ships an ambient
// `declare var process: { env: { NODE_ENV?: string } }` to enforce the
// bundler-agnostic dev-gate pattern, which narrows `process` for ANY
// file pulled in by runtime-dom's typecheck — including this one when
// imported via the `bun` condition. Casting through a local interface
// restores access to the platform/arch/report fields we genuinely need.
interface NodeProcess {
  platform: string
  arch: string
  report?: {
    getReport(): unknown
  }
}
const nodeProcess = process as unknown as NodeProcess

/**
 * Resolve the per-platform package name following the napi-rs naming
 * convention: `@pyreon/compiler-<platform>-<arch>[-<libc>]`.
 *
 * Examples:
 *   darwin + arm64        → @pyreon/compiler-darwin-arm64
 *   darwin + x64          → @pyreon/compiler-darwin-x64
 *   linux + x64 + gnu     → @pyreon/compiler-linux-x64-gnu
 *   linux + arm64 + gnu   → @pyreon/compiler-linux-arm64-gnu
 *   win32 + x64 + msvc    → @pyreon/compiler-win32-x64-msvc
 *
 * Returns `null` for unsupported (platform, arch) combinations — caller
 * skips per-platform resolution entirely and falls through to JS.
 */
export function getPlatformPackageName(
  platform: string = nodeProcess.platform,
  arch: string = nodeProcess.arch,
  libc: string | null = detectLibc(platform),
): string | null {
  // Build the suffix for libc-bearing platforms (Linux glibc/musl,
  // Windows MSVC). Single source of truth — no per-platform branching.
  const suffix = libc ? `-${libc}` : ''
  // Allowlist of (platform, arch) combos that the cross-platform CI
  // workflow actually builds. Keep in sync with
  // `.github/workflows/release-native.yml` matrix.
  const supported: Record<string, string[]> = {
    darwin: ['arm64', 'x64'],
    linux: ['x64', 'arm64'],
    win32: ['x64'],
  }
  if (!supported[platform]?.includes(arch)) return null
  return `@pyreon/compiler-${platform}-${arch}${suffix}`
}

/**
 * Detect the libc family for the current Linux runtime. Returns:
 *   - `'gnu'` on glibc-based distros (Debian, Ubuntu, RHEL, …)
 *   - `'musl'` on musl-based distros (Alpine, …)
 *   - `null` on macOS / Windows (no libc differentiation)
 *   - `'msvc'` on Windows (we only ship MSVC binaries)
 *
 * `process.report.getReport().header.glibcVersionRuntime` is the
 * Node-canonical detection: present on glibc, absent on musl. Falls
 * back to `gnu` on read failure since glibc is the more common case.
 */
function detectLibc(platform: string): string | null {
  if (platform === 'win32') return 'msvc'
  if (platform !== 'linux') return null
  try {
    const report = nodeProcess.report?.getReport()
    if (typeof report === 'object' && report !== null) {
      const header = (report as { header?: { glibcVersionRuntime?: string } }).header
      return header?.glibcVersionRuntime ? 'gnu' : 'musl'
    }
  } catch {
    // Best-effort detection — fall through to glibc default.
  }
  return 'gnu'
}

/**
 * Load the native binding by trying paths in order:
 *   1. In-tree binary (`<package>/native/pyreon-compiler.node`)
 *   2. Per-platform npm package (`@pyreon/compiler-<triple>`)
 *
 * Returns `null` if both paths fail — caller falls back to the
 * pure-JS implementation. NEVER throws — every error path swallows
 * silently because a missing native binary is a perf optimization
 * miss, not a correctness failure.
 */
export function loadNativeBinding(metaUrl: string): NativeBinding | null {
  const nativeRequire = createRequire(metaUrl)

  // Path 1: in-tree binary (dev mode + Phase 2 local-build path).
  try {
    const __filename = fileURLToPath(metaUrl)
    const __dirname = dirname(__filename)
    const nativePath = join(__dirname, '..', 'native', 'pyreon-compiler.node')
    return nativeRequire(nativePath) as NativeBinding
  } catch {
    // In-tree binary not present — fall through to per-platform package.
  }

  // Path 2: per-platform npm package (production install path).
  // Will start working once Phase 5b publishes the per-platform
  // packages and `optionalDependencies` resolves them at install time.
  const pkgName = getPlatformPackageName()
  if (pkgName !== null) {
    try {
      return nativeRequire(pkgName) as NativeBinding
    } catch {
      // Per-platform package not installed (typical pre-Phase-5b
      // state, or a platform we don't yet ship binaries for).
    }
  }

  return null
}

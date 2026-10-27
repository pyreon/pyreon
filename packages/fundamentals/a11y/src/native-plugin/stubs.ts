/**
 * The compile-gate stubs the `@pyreon/a11y` lowering's emit needs beyond the SwiftUI / Compose stub bundle: the `PyreonA11y` object an imperative `announce(...)` call lowers to.
 * They mirror the REAL runtimes (`@pyreon/a11y/native`) exactly — a superset stub masks real breakage, a narrower one manufactures it.
 *
 * Appended to the bundle only for an emit that names the type (see {@link a11yStubs}); the compiler never reads them.
 */

import type { StubAugmentation } from '@pyreon/native-compiler/plugin-api'

export const A11Y_SWIFT_STUBS = `// PyreonA11y — mirror of runtime-swift's PyreonA11y.swift: a static
// \`announce(_:assertive:)\` the imperative \`announce(...)\` call lowers to.
public enum PyreonA11y {
  public static func announce(_ message: String, assertive: Bool = false) {}
}
`

export const A11Y_KOTLIN_STUBS = `// PyreonA11y — mirror of the a11y Kotlin runtime: the object an imperative
// \`announce(...)\` call lowers to, and the \`PyreonA11yHost\` composable the
// emit wraps an announcing component in (PyreonA11yAndroid.kt).
object PyreonA11y {
  fun addAnnouncer(fn: (String, Boolean) -> Unit) {}
  fun removeAnnouncer(fn: (String, Boolean) -> Unit) {}
  fun announce(message: String, assertive: Boolean = false) {}
}
@Composable
fun PyreonA11yHost(content: @Composable () -> Unit) {}
`

/** The compile-gate stubs, appended only to an emit that names a type they declare. */
export const a11yStubs: StubAugmentation = {
  swift: (source) => (/\bPyreonA11y\b/.test(source) ? A11Y_SWIFT_STUBS : ''),
  kotlin: (source) => (/\bPyreonA11y(Host)?\b/.test(source) ? A11Y_KOTLIN_STUBS : ''),
}

/**
 * Extra type-gate stub text a library's emit needs.
 *
 * The compile gates (`validateSwiftWithStubs`, `validateKotlin`, and their
 * multi-file twins) compile an emit against hand-written stubs of SwiftUI /
 * Compose and the Pyreon runtime, because the real SDKs are not available
 * everywhere. A library whose emit names types those stubs do not declare — a
 * runtime view, a generated engine — supplies them HERE, per target, from the
 * emitted `source`; the stub text it returns is appended to the bundle only
 * for the inputs that need it (return `''` for any other).
 *
 * The same rule applies as for the core stubs: mirror the real surface EXACTLY.
 * A superset stub masks real breakage, a narrower one manufactures it.
 */
export interface StubAugmentation {
  /** Swift stub text `source` needs beyond the SwiftUI bundle, or `''`. */
  swift?(source: string): string
  /** Kotlin stub text `source` needs beyond the Compose bundle, or `''`. */
  kotlin?(source: string): string
}

/** Options every compile gate accepts. */
export interface ValidateOptions {
  /** Library stub augmentations (typically each loaded plugin's `stubs`). */
  readonly augment?: readonly StubAugmentation[] | undefined
}

export function swiftAugmentation(options: ValidateOptions | undefined, source: string): string {
  let out = ''
  for (const a of options?.augment ?? []) out += a.swift?.(source) ?? ''
  return out
}

export function kotlinAugmentation(options: ValidateOptions | undefined, source: string): string {
  let out = ''
  for (const a of options?.augment ?? []) out += a.kotlin?.(source) ?? ''
  return out
}

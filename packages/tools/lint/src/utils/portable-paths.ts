/**
 * Which files must survive iOS and Android.
 *
 * Every `portable` rule needs this same answer, and it deliberately has no
 * default: which files reach a native target cannot be inferred from their
 * contents, and guessing wrong is expensive in both directions. Unscoped, these
 * rules produce thousands of findings in code entitled to the whole language;
 * scoped too narrowly, they silently protect nothing.
 *
 * So the caller states it. A scaffolder knows the answer at the moment it
 * creates `src/`, which is why `create-multiplatform` writes it into the config
 * it emits.
 *
 * Substring match, the same convention as `exemptPaths`.
 */
export function portablePathsFrom(context: { getOptions(): unknown }): string[] {
  const raw = (context.getOptions() as { portablePaths?: unknown }).portablePaths
  return Array.isArray(raw)
    ? raw.filter((x): x is string => typeof x === 'string' && x.length > 0)
    : []
}

/**
 * True when this file is one the caller declared portable.
 *
 * No explicit empty-array guard: `some` is already false for one, and an
 * unconfigured rule therefore matches nothing — which is the intended default.
 */
export function isPortablePath(filePath: string, paths: readonly string[]): boolean {
  return paths.some((entry) => filePath.includes(entry))
}

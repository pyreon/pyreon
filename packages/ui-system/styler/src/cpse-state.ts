/**
 * Custom-Property Style Extraction (CPSE) switch, shared by `./styled` (which
 * reads it on the static resolve path) and `@pyreon/styler/internal` (which
 * exports the setter). Its own module so the two entries share only this.
 */
export let cpseEnabled = false
export let cpseRewrite: ((cssText: string, varsOut: Record<string, string>) => string) | null = null

/**
 * Turn Custom-Property Style Extraction on or off and inject its rewrite.
 * `@pyreon/ui-core` calls it for `init({ styleExtraction: true })`, passing
 * `@pyreon/unistyle`'s `cpseRewrite`; apps enable CPSE through that flag.
 * Reached through `@pyreon/styler/internal`.
 *
 * @internal
 */
export const setStyleExtraction = (
  enabled: boolean,
  rewrite?: (cssText: string, varsOut: Record<string, string>) => string,
): void => {
  cpseEnabled = enabled
  if (rewrite) cpseRewrite = rewrite
}

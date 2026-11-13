/**
 * GitHub Actions workflow-command annotations (rule 5, `--gha`):
 * `::error file=a.ts,line=3,col=7,title=rule::message`, which GitHub turns
 * into inline annotations on the pull request. Reference:
 * https://docs.github.com/en/actions/reference/workflow-commands-for-github-actions
 */

export type GhaLevel = 'error' | 'warning' | 'notice'

/** The message after `::`: `%`, CR and LF must be percent-encoded. */
export const ghaEscape = (s: string): string =>
  s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')

/**
 * A property value (`file=`, `title=`) also needs `,` and `:` encoded, or a
 * comma in the value ends the property early.
 */
export const ghaProperty = (s: string): string => ghaEscape(s).replace(/,/g, '%2C').replace(/:/g, '%3A')

/** Map a finding severity to its annotation level (`info` → `notice`). */
export const ghaLevel = (severity: 'error' | 'warning' | 'warn' | 'info'): GhaLevel =>
  severity === 'error' ? 'error' : severity === 'info' ? 'notice' : 'warning'

export interface GhaAnnotation {
  level: GhaLevel
  message: string
  title?: string | undefined
  file?: string | undefined
  line?: number | undefined
  column?: number | undefined
}

/** One annotation line. Properties appear in the order title, file, line, col. */
export const ghaAnnotation = (a: GhaAnnotation): string => {
  const props: string[] = []
  if (a.title) props.push(`title=${ghaProperty(a.title)}`)
  if (a.file) props.push(`file=${ghaProperty(a.file)}`)
  if (a.line) props.push(`line=${a.line}`)
  if (a.column) props.push(`col=${a.column}`)
  return `::${a.level}${props.length > 0 ? ` ${props.join(',')}` : ''}::${ghaEscape(a.message)}`
}

/**
 * Fills the `{name}` placeholders of a template string from the content set
 * (`template` in each family). A placeholder with no value is a content bug,
 * so it throws (during the build, for a static page) instead of printing `{name}`.
 */
export function fill(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (_m, key: string) => {
    const v = values[key]
    if (v === undefined) throw new Error(`[Pyreon] site template "${template}" needs a value for {${key}}; pass it to fill().`)
    return String(v)
  })
}

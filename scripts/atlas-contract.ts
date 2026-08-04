/**
 * Pure renderers for the derived component contract.
 *
 * Split from `check-atlas-guide.ts` so importing them costs NOTHING: that file
 * reaches `runScan`, which reaches all of Atlas, which needs `pngjs` types —
 * and a unit test for a string renderer has no business declaring those. The
 * gate imports these; so does the test; neither pulls the other's weight.
 */

/** One component's line in the digest: every prop, with its legal values. */
function describeComponent(c: {
  name: string
  tags?: readonly string[]
  controls: readonly {
    name: string
    kind: string
    options?: readonly string[]
    required?: boolean
    reactive?: boolean
  }[]
}): string {
  const describe = (ctl: (typeof c.controls)[number]): string =>
    ctl.kind === 'select' && ctl.options && ctl.options.length > 0
      ? // Values SORTED: the order rocketstyle reports its dimension keys in is
        // an implementation detail, and letting it into the artifact would make
        // an unrelated refactor look like a contract change.
        `${ctl.name}(${[...ctl.options].sort().join('|')})`
      : `${ctl.name}(${ctl.kind})`

  // Controls sorted by name for the same reason.
  const sorted = [...c.controls].sort((a, b) => a.name.localeCompare(b.name))
  const required = sorted.filter((x) => x.required).map(describe)
  const optional = sorted.filter((x) => !x.required).map(describe)
  const reactive = sorted.filter((x) => x.reactive).map((x) => x.name)

  const tags = c.tags && c.tags.length > 0 ? ` [${[...c.tags].sort().join(', ')}]` : ''
  const lines = [`## ${c.name}${tags}`]
  if (required.length > 0) lines.push(`required: ${required.join(', ')}`)
  if (optional.length > 0) lines.push(`optional: ${optional.join(', ')}`)
  if (reactive.length > 0) lines.push(`reactive: ${reactive.join(', ')}`)
  return lines.join('\n')
}

/**
 * The committed artifact.
 *
 * Deterministic by construction: derived only from names, tags and prop
 * contracts, every list sorted, nothing drawn from a mount or a verdict.
 */
export function renderContract(components: readonly Parameters<typeof describeComponent>[0][]): string {
  const sorted = [...components].sort((a, b) => a.name.localeCompare(b.name))
  return [
    '# Component Contract',
    '',
    'DERIVED — do not edit. Regenerate with `bun run atlas-guide --update`.',
    '',
    'Every component and the exact values each prop accepts. A rename here is a',
    'breaking change for anything written against it, including AI assistants;',
    'the gate exists so this file cannot silently disagree with the source.',
    '',
    'Verify a usage before committing to it:',
    '',
    "    atlas check <Component> '{\"prop\":\"value\"}'",
    '',
    ...sorted.map((c) => `${describeComponent(c)}\n`),
  ].join('\n')
}


/** Component headings whose block differs between two guides. */
export function diffComponents(before: string, after: string): string[] {
  const blocks = (text: string): Map<string, string> => {
    const out = new Map<string, string>()
    let name = ''
    let body: string[] = []
    for (const line of text.split('\n')) {
      const heading = /^## (\S+)/.exec(line)
      if (heading) {
        if (name) out.set(name, body.join('\n'))
        name = heading[1]!
        body = []
      } else if (name) {
        body.push(line)
      }
    }
    if (name) out.set(name, body.join('\n'))
    return out
  }
  const a = blocks(before)
  const b = blocks(after)
  const names = new Set([...a.keys(), ...b.keys()])
  return [...names].filter((n) => a.get(n) !== b.get(n)).sort()
}


/**
 * The code a consumer actually loads when it imports an entry point: the
 * entry chunk PLUS every chunk it reaches through STATIC imports, but none of
 * the chunks behind a dynamic `import()` (those are the lazy boundary that
 * `splitting: true` exists to keep out of the number).
 *
 * WHY this exists. Both budget gates used to measure the `entry-point` output
 * alone. That is only the true size if the bundler inlines every static
 * dependency into the entry, and whether it does is a CHUNKING decision the
 * bundler makes per version. Measured on `@pyreon/flow::core`: bun 1.4.0
 * moved the edge-path helpers (14 KB, shared with the lazy layout chunk) into
 * a separate chunk that the entry imports statically, so the gate never
 * counted them; bun 1.4.4 inlines the same code into the entry, and the
 * "same" import measured 1.6 KB gzip larger. Neither version was wrong about
 * what loads — the gate was wrong about what it measured. Following the
 * static closure makes the number independent of where the bundler draws
 * chunk boundaries.
 *
 * The chunks are concatenated in discovery order before gzip, so the result
 * is comparable to the single-file case where the bundler inlined everything.
 */

export interface BuildOutputLike {
  kind: string
  path: string
  text(): Promise<string>
}

/**
 * Relative specifiers of the STATIC imports/re-exports in `code`
 * (`import … from "./x.js"`, `import "./x.js"`, `export … from "./x.js"`).
 * A dynamic `import("./x.js")` is deliberately not matched: `import` followed
 * by `(` never satisfies the pattern.
 */
export function staticRelativeImports(code: string): string[] {
  const out: string[] = []
  const re = /\b(?:import|export)\s*(?:[\w*{$][^"'();]*?\bfrom\s*)?["'](\.\.?\/[^"']+)["']/g
  for (const m of code.matchAll(re)) out.push(m[1] as string)
  return out
}

function baseName(p: string): string {
  return p.split(/[\\/]/).pop() ?? p
}

/** Entry code followed by every statically reachable chunk, each once. */
export async function staticClosureCode(
  outputs: readonly BuildOutputLike[],
): Promise<string | null> {
  const entry = outputs.find((o) => o.kind === 'entry-point')
  if (!entry) return null
  const byName = new Map<string, BuildOutputLike>()
  for (const o of outputs) byName.set(baseName(o.path), o)

  const seen = new Set<string>([baseName(entry.path)])
  const parts: string[] = []
  const queue: BuildOutputLike[] = [entry]
  while (queue.length > 0) {
    const cur = queue.shift() as BuildOutputLike
    const code = await cur.text()
    parts.push(code)
    for (const spec of staticRelativeImports(code)) {
      const name = baseName(spec)
      if (seen.has(name)) continue
      const next = byName.get(name)
      if (!next) continue
      seen.add(name)
      queue.push(next)
    }
  }
  return parts.join('\n')
}

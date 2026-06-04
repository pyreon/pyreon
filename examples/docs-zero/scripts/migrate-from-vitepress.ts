#!/usr/bin/env bun
import { promises as fs } from 'node:fs'
import path from 'node:path'

// ─── VitePress → zero-content markdown migrator ────────────────────────────
//
// Walks the legacy `docs/docs/` directory, converts the VitePress-specific
// markdown into zero-content-compatible MDX, and writes the result to
// `examples/docs-zero/src/content/docs/`.
//
// Conversions applied:
//
//   1. `<Playground title="..." :height="N">…raw js…</Playground>`
//      →  `<Playground title="..." height={N} code={`…raw js…`} />`
//
//   2. `<Playground title="..." :height="N">…</Playground>` (no code body)
//      →  `<Playground title="..." height={N} />`
//
//   3. ``` lang title="filename" → ``` lang (the title attr is VitePress-
//      specific and isn't standard markdown; shiki + zero-content handle
//      the lang fine without it).
//
//   4. `::: code-group` is preserved (remark-directive accepts it).
//
//   5. Headings / lists / code fences / inline emphasis / GFM tables all
//      round-trip unchanged.
//
//   6. The frontmatter is kept verbatim; the zero-content schema only
//      requires `title`.
//
// Run with: `bun scripts/migrate-from-vitepress.ts`

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..')
const SOURCE_DIR = path.join(ROOT, 'docs', 'docs')
const TARGET_DIR = path.join(ROOT, 'examples', 'docs-zero', 'src', 'content', 'docs')

interface MigrationResult {
  source: string
  target: string
  bytesIn: number
  bytesOut: number
  conversions: string[]
}

async function main() {
  const entries = await fs.readdir(SOURCE_DIR, { withFileTypes: true })
  const mdFiles = entries.filter(
    (e) => e.isFile() && e.name.endsWith('.md'),
  )
  await fs.mkdir(TARGET_DIR, { recursive: true })

  console.log(`Migrating ${mdFiles.length} files from`)
  console.log(`  ${SOURCE_DIR}`)
  console.log(`to`)
  console.log(`  ${TARGET_DIR}`)
  console.log()

  const results: MigrationResult[] = []
  for (const file of mdFiles) {
    const sourcePath = path.join(SOURCE_DIR, file.name)
    const targetPath = path.join(TARGET_DIR, file.name)
    let source = await fs.readFile(sourcePath, 'utf8')
    let conversions: string[]

    // Add minimal `--- title: ... ---` frontmatter when the source has
    // none. The collection schema requires `title`; the H1 is the
    // canonical fallback.
    if (!source.startsWith('---')) {
      const h1 = source.match(/^# (.+)$/m)
      const title = (h1?.[1] ?? file.name.replace(/\.md$/, '')).trim()
      source = `---\ntitle: ${needsYamlQuote(title) ? `"${title}"` : title}\n---\n\n${source}`
      ;({ output: source, conversions } = convertMarkdown(source))
      conversions.unshift('frontmatter added from H1')
    } else {
      ;({ output: source, conversions } = convertMarkdown(source))
    }

    await fs.writeFile(targetPath, source, 'utf8')
    results.push({
      source: file.name,
      target: file.name,
      bytesIn: Buffer.byteLength(source, 'utf8'),
      bytesOut: Buffer.byteLength(source, 'utf8'),
      conversions,
    })
  }

  let totalConversions = 0
  for (const r of results) {
    if (r.conversions.length > 0) {
      console.log(`  ${r.source}: ${r.conversions.join(', ')}`)
      totalConversions += r.conversions.length
    }
  }
  console.log()
  console.log(
    `✓ Migrated ${results.length} files (${totalConversions} conversions applied)`,
  )
}

export function convertMarkdown(source: string): {
  output: string
  conversions: string[]
} {
  const conversions: string[] = []
  let out = source

  // 1. Playground with raw-JS-as-children:
  //    <Playground title="X" :height="Y">
  //    …raw js…
  //    </Playground>
  //    →
  //    <Playground title="X" height={Y} code={`…raw js…`} />
  out = out.replace(
    /<Playground\s+([^>]*?)>([\s\S]*?)<\/Playground>/g,
    (full, attrs: string, body: string) => {
      // Strip leading/trailing newlines from the body.
      const code = body.replace(/^\n+/, '').replace(/\n+$/, '')
      // Convert :height="N" → height={N}.
      const normalized = attrs.replace(
        /:height="(\d+)"/g,
        (_match, n: string) => `height={${n}}`,
      )
      conversions.push('Playground → JSX-valid self-close')
      if (code.length === 0) {
        return `<Playground ${normalized.trim()} />`
      }
      // Escape backticks + ${ in the code body so the template literal
      // is parsable.
      const escaped = code.replace(/`/g, '\\`').replace(/\$\{/g, '\\${')
      return `<Playground ${normalized.trim()} code={\`${escaped}\`} />`
    },
  )

  // 2. Bare Vue :height attribute on a self-closing Playground:
  //    <Playground :height="N" /> → <Playground height={N} />
  out = out.replace(
    /<Playground\s+([^>]*?)\s*\/>/g,
    (_full, attrs: string) => {
      const normalized = attrs.replace(
        /:height="(\d+)"/g,
        (_match, n: string) => `height={${n}}`,
      )
      if (normalized !== attrs) conversions.push('Playground :height → height')
      return `<Playground ${normalized.trim()} />`
    },
  )

  // 3. Code fences with VitePress-specific `title="…"`:
  //    ```ts title="vite.config.ts"   →   ```ts
  out = out.replace(
    /^(```\w+)\s+title="[^"]+"$/gm,
    (full, fence: string) => {
      conversions.push('code-fence title attr stripped')
      return fence
    },
  )

  // 4. VitePress `<<<` file-snippet imports (we don't support these yet —
  //    surface them as a fenced code block placeholder so the build
  //    doesn't crash).
  out = out.replace(
    /^<<<\s*@\/([^\n]+)$/gm,
    (full, ref: string) => {
      conversions.push(`<<< @ snippet → placeholder (${ref})`)
      return `\`\`\`\n[VitePress file-snippet not yet supported: <<< @${ref}]\n\`\`\``
    },
  )

  // 5. Drop any TIP / WARNING / DANGER blocks that use the verbose
  //    GitHub admonition syntax — convert to the directive form.
  //    > [!TIP]   → :::tip
  out = out.replace(
    /^>\s*\[!TIP\]\s*\n((?:^>.*\n)+)/gm,
    (_full, body: string) => {
      conversions.push('GH admonition TIP → :::tip')
      const stripped = body.replace(/^>\s?/gm, '').replace(/\n$/, '')
      return `:::tip\n${stripped}\n:::\n`
    },
  )
  out = out.replace(
    /^>\s*\[!WARNING\]\s*\n((?:^>.*\n)+)/gm,
    (_full, body: string) => {
      conversions.push('GH admonition WARNING → :::warning')
      const stripped = body.replace(/^>\s?/gm, '').replace(/\n$/, '')
      return `:::warning\n${stripped}\n:::\n`
    },
  )

  // 6. HTML comments — invalid in MDX. Convert to JSX comments.
  out = out.replace(
    /<!--\s*([\s\S]*?)\s*-->/g,
    (_full, body: string) => {
      conversions.push('HTML comment → JSX comment')
      return `{/* ${body.replace(/\*\//g, '*\\/')} */}`
    },
  )

  // 7. `<` followed by digit in prose ("<50 ms") — escape outside code
  //    fences. MDX parses `<5` as the start of an invalid JSX tag.
  out = escapeLtDigitOutsideFences(out, conversions)

  // 8. Strip <APICard /> / <CompatMatrix /> / <PropTable /> / etc. — they
  //    were VitePress-specific Vue components whose attribute values
  //    contain literal JSX (e.g. `signature='<RouterLink>...'`) that the
  //    MDX parser can't reason about. The migration replaces each call
  //    site with a JSX comment naming the deferred component. PR 9
  //    polish will port these to first-party Pyreon components and
  //    restore the API-reference rendering.
  for (const name of ['APICard', 'PropTable', 'CompatMatrix']) {
    out = stripComponentInvocation(out, name, conversions)
  }

  // 9. YAML frontmatter title starting with `@` — must be quoted (YAML
  //    treats unquoted `@` as a reserved character).
  out = out.replace(
    /^title: (@[^\n]+)$/m,
    (_full, value: string) => {
      conversions.push(`title quoted ('${value.slice(0, 20)}…')`)
      return `title: "${value}"`
    },
  )

  // 10. `<div class="...">` wrapper inserted by VitePress homepages —
  //     the inline JSX inside fails to parse because MDX expects
  //     flush-left JSX block elements. Strip the wrapper, keep the
  //     children.
  out = out.replace(
    /<div class="[^"]*">\n((?:.*?\n)*?)<\/div>/g,
    (_full, inner: string) => {
      conversions.push('<div class=...> wrapper stripped')
      return inner.replace(/^ {2}/gm, '').trim()
    },
  )

  return { output: out, conversions: dedupeKeep(conversions) }
}

// Escape `<` followed by digit (e.g. "<50ms") outside fenced code blocks.
function escapeLtDigitOutsideFences(
  source: string,
  conversions: string[],
): string {
  const lines = source.split('\n')
  let inFence = false
  let touched = false
  const out = lines.map((line) => {
    if (line.trimStart().startsWith('```')) {
      inFence = !inFence
      return line
    }
    if (inFence) return line
    const replaced = line.replace(/<(\d)/g, '&lt;$1')
    if (replaced !== line) touched = true
    return replaced
  })
  if (touched) conversions.push('< before digit escaped (&lt;)')
  return out.join('\n')
}

// Strip a JSX-shaped component invocation whose attribute values may
// contain literal JSX (so a naïve `<NAME[^>]*?/>` regex would miss the
// real terminator). Tracks quote state to find the real closing `>`.
function stripComponentInvocation(
  source: string,
  componentName: string,
  conversions: string[],
): string {
  const startToken = `<${componentName}`
  let i = 0
  let result = ''
  let count = 0
  while (i < source.length) {
    const j = source.indexOf(startToken, i)
    if (j < 0) {
      result += source.slice(i)
      break
    }
    // Ensure it's a real component reference (next char is space/newline/`/`/`>`).
    const next = source[j + startToken.length]
    if (next !== ' ' && next !== '\n' && next !== '\t' && next !== '/' && next !== '>') {
      result += source.slice(i, j + 1)
      i = j + 1
      continue
    }
    result += source.slice(i, j)
    // Scan for the real end `>`, respecting single/double quotes.
    let k = j + startToken.length
    let inQuote: '"' | "'" | null = null
    while (k < source.length) {
      const c = source[k]
      if (inQuote) {
        if (c === inQuote) inQuote = null
        k++
        continue
      }
      if (c === '"' || c === "'") {
        inQuote = c
        k++
        continue
      }
      if (c === '>') {
        k++
        break
      }
      k++
    }
    result += `{/* ${componentName} (VitePress custom component — migration deferred) */}`
    i = k
    count++
  }
  if (count > 0) {
    conversions.push(`<${componentName} /> stripped (×${count})`)
  }
  return result
}

function needsYamlQuote(value: string): boolean {
  // YAML treats `@`, `&`, `*`, `!`, `|`, `>`, `'`, `"`, `#`, `%`, `,`,
  // `?`, `:`, `-`, `<`, `=` etc. as reserved when leading. Quote
  // anything starting with one of those.
  return /^[@&*!|>'"%,?:\-<=]/.test(value)
}

function dedupeKeep(arr: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const x of arr) {
    if (!seen.has(x)) {
      seen.add(x)
      out.push(x)
    }
  }
  return out
}

if (import.meta.main) {
  main().catch((err) => {
    console.error('Migration failed:', err)
    process.exit(1)
  })
}

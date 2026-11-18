import { joinUrl } from './sitemap'

// ─── llms.txt emitter (PR-L audit M19) ────────────────────────────────────
//
// Pure builder that produces an `llms.txt` file following the
// emerging convention at https://llmstxt.org/. The format is a
// markdown-shaped index designed for LLM ingestion:
//
//     # <Site Title>
//
//     > <Optional one-line description>
//
//     ## <Section name>
//
//     - [Page title](https://example.com/page): One-line description.
//
// Internal: the content plugin's `seo.llms` option calls it at build close.

export interface LlmsTxtPage {
  /** Page title. */
  title: string
  /** Relative URL — joined to baseUrl at render time. */
  path: string
  /** Optional one-line description. */
  description?: string
}

export interface LlmsTxtSection {
  /** Section heading. */
  name: string
  pages: LlmsTxtPage[]
}

export interface GenerateLlmsTxtArgs {
  /** Site title. */
  title: string
  /** Site origin (no trailing slash). */
  baseUrl: string
  /** Optional one-line description (rendered as a blockquote). */
  description?: string
  /** Sectioned page list. */
  sections: LlmsTxtSection[]
}

/** Build an llms.txt string. Internal to the content plugin's `seo.llms` output. */
export function generateLlmsTxt(args: GenerateLlmsTxtArgs): string {
  const lines: string[] = []
  lines.push(`# ${args.title}`)
  lines.push('')
  if (args.description) {
    lines.push(`> ${args.description}`)
    lines.push('')
  }
  for (const section of args.sections) {
    lines.push(`## ${section.name}`)
    lines.push('')
    for (const page of section.pages) {
      const url = joinUrl(args.baseUrl, page.path)
      const desc = page.description ? `: ${page.description}` : ''
      lines.push(`- [${page.title}](${url})${desc}`)
    }
    lines.push('')
  }
  // Trim trailing blank line for stable diff output.
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop()
  }
  return lines.join('\n') + '\n'
}

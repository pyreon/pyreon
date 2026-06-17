import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import * as p from '@clack/prompts'
import type { CliArgs } from './args'
import {
  type AdapterId,
  type AiToolId,
  FEATURE_CATEGORIES,
  FEATURES,
  type IntegrationId,
  type PresetId,
  PRESETS,
  type ProjectConfig,
  TEMPLATES,
  type TemplateId,
} from './templates'

const ADAPTER_LABELS: Record<AdapterId, { label: string; hint: string }> = {
  vercel: { label: 'Vercel', hint: 'serverless / edge — vercel.json + one-click deploy badge' },
  cloudflare: { label: 'Cloudflare Pages', hint: 'workers — wrangler.toml + _routes.json' },
  netlify: { label: 'Netlify', hint: 'netlify functions — netlify.toml' },
  node: { label: 'Node.js', hint: 'Dockerfile + start script for self-hosting' },
  bun: { label: 'Bun', hint: 'Dockerfile (bun-based) for self-hosting on Bun runtimes' },
  static: { label: 'Static (no server)', hint: 'works with any static host (GitHub Pages, S3, …)' },
}

/**
 * Run the interactive prompt flow. Every prompt is skipped when its
 * corresponding CLI flag is set or when `--yes` was passed; in that
 * case the template-default (or flag-supplied) value is used.
 *
 * Cancellation at any prompt aborts via `process.exit(0)`.
 */
export async function runPrompts(args: CliArgs): Promise<ProjectConfig> {
  const yes = args.yes

  // ─── Project name ─────────────────────────────────────────────────────────
  let name: string
  if (args.name !== undefined) {
    name = args.name
  } else if (yes) {
    p.cancel('Project name is required when using --yes (pass it as the first argument).')
    process.exit(2)
  } else {
    const value = await p.text({
      message: 'Project name',
      placeholder: 'my-zero-app',
      validate: (v) => {
        if (!v?.trim()) return 'Project name is required'
        if (existsSync(resolve(process.cwd(), v))) return `Directory "${v}" already exists`
      },
    })
    if (p.isCancel(value)) {
      p.cancel('Cancelled.')
      process.exit(0)
    }
    name = value
  }

  const targetDir = resolve(process.cwd(), name)
  if (existsSync(targetDir)) {
    p.cancel(`Directory "${name}" already exists.`)
    process.exit(1)
  }

  // ─── Template ─────────────────────────────────────────────────────────────
  let template: TemplateId
  if (args.template) {
    template = args.template
  } else if (yes) {
    template = 'app'
  } else {
    const value = await p.select({
      message: 'Template',
      options: Object.values(TEMPLATES).map((t) => ({
        value: t.id,
        label: t.label,
        hint: t.hint,
      })),
    })
    if (p.isCancel(value)) {
      p.cancel('Cancelled.')
      process.exit(0)
    }
    template = value as TemplateId
  }

  const tmpl = TEMPLATES[template]

  // ─── Rendering mode (skipped if template forces it) ───────────────────────
  let renderMode: ProjectConfig['renderMode']
  if (tmpl.forcesMode) {
    renderMode = tmpl.defaultMode
  } else if (args.mode) {
    renderMode = args.mode
  } else if (yes) {
    renderMode = tmpl.defaultMode
  } else {
    const value = await p.select({
      message: 'Rendering mode',
      options: [
        {
          value: 'ssr-stream',
          label: 'SSR Streaming',
          hint: 'recommended — progressive HTML with Suspense',
        },
        {
          value: 'ssr-string',
          label: 'SSR String',
          hint: 'buffered HTML, simpler but slower TTFB',
        },
        { value: 'ssg', label: 'Static (SSG)', hint: 'pre-rendered at build time' },
        { value: 'spa', label: 'SPA', hint: 'client-only, no server rendering' },
      ],
      initialValue: tmpl.defaultMode,
    })
    if (p.isCancel(value)) {
      p.cancel('Cancelled.')
      process.exit(0)
    }
    renderMode = value as ProjectConfig['renderMode']
  }

  // ─── Adapter (filtered by template compatibility) ─────────────────────────
  let adapter: AdapterId
  if (args.adapter) {
    if (!tmpl.adapters.includes(args.adapter)) {
      p.cancel(
        `Adapter "${args.adapter}" is not supported by template "${template}". Allowed: ${tmpl.adapters.join(', ')}.`,
      )
      process.exit(2)
    }
    adapter = args.adapter
  } else if (yes) {
    adapter = tmpl.defaultAdapter
  } else {
    const value = await p.select({
      message: 'Deployment target',
      options: tmpl.adapters.map((id) => ({
        value: id,
        label: ADAPTER_LABELS[id].label,
        hint: ADAPTER_LABELS[id].hint,
      })),
      initialValue: tmpl.defaultAdapter,
    })
    if (p.isCancel(value)) {
      p.cancel('Cancelled.')
      process.exit(0)
    }
    adapter = value as AdapterId
  }

  // ─── Features ─────────────────────────────────────────────────────────────
  // Resolution order (highest-priority overrides lower):
  //   1. --features <csv> — explicit list, ignores everything else
  //   2. --preset <id> as starting set + --with-X / --no-X applied
  //   3. --yes mode: template default + --with-X / --no-X
  //   4. Interactive: preset prompt OR template default → grouped multiselect
  //      → --with-X / --no-X applied
  const features = await resolveFeatures(args, tmpl.defaultFeatures, yes)

  // ─── Package strategy ─────────────────────────────────────────────────────
  let packageStrategy: ProjectConfig['packageStrategy']
  if (args.packageStrategy) {
    packageStrategy = args.packageStrategy
  } else if (yes) {
    packageStrategy = 'meta'
  } else {
    const value = await p.select({
      message: 'Package imports',
      options: [
        {
          value: 'meta',
          label: '@pyreon/meta (single barrel)',
          hint: 'one import for everything — simpler, tree-shaken at build',
        },
        {
          value: 'individual',
          label: 'Individual packages',
          hint: 'only install what you selected — smaller node_modules',
        },
      ],
    })
    if (p.isCancel(value)) {
      p.cancel('Cancelled.')
      process.exit(0)
    }
    packageStrategy = value as ProjectConfig['packageStrategy']
  }

  // ─── Integrations ─────────────────────────────────────────────────────────
  let integrations: IntegrationId[]
  if (args.integrations !== undefined) {
    integrations = args.integrations
  } else if (yes) {
    integrations = [...tmpl.defaultIntegrations]
  } else {
    const value = await p.multiselect({
      message: 'Backend integrations (space to toggle)',
      options: [
        {
          value: 'supabase',
          label: 'Supabase',
          hint: 'Postgres + auth + storage — replaces dashboard auth/db stubs',
        },
        {
          value: 'email',
          label: 'Email (Resend)',
          hint: 'Resend transport + document-primitives email templates',
        },
      ],
      initialValues: [...tmpl.defaultIntegrations],
      required: false,
    })
    if (p.isCancel(value)) {
      p.cancel('Cancelled.')
      process.exit(0)
    }
    integrations = value as IntegrationId[]
  }

  // ─── AI tooling ───────────────────────────────────────────────────────────
  let aiTools: AiToolId[]
  if (args.ai !== undefined) {
    aiTools = args.ai
  } else if (yes) {
    aiTools = ['mcp', 'claude']
  } else {
    const value = await p.multiselect({
      message: 'AI tooling (space to toggle, enter to confirm)',
      options: [
        { value: 'mcp', label: 'MCP server', hint: '.mcp.json — Claude Code, Continue.dev' },
        { value: 'claude', label: 'CLAUDE.md', hint: 'Claude Code project rules' },
        { value: 'cursor', label: 'Cursor rules', hint: '.cursor/rules/pyreon.md' },
        { value: 'copilot', label: 'GitHub Copilot', hint: '.github/copilot-instructions.md' },
        { value: 'agents', label: 'AGENTS.md', hint: 'Aider, Continue, editor agents' },
      ],
      initialValues: ['mcp', 'claude'],
      required: false,
    })
    if (p.isCancel(value)) {
      p.cancel('Cancelled.')
      process.exit(0)
    }
    aiTools = value as AiToolId[]
  }

  // ─── Compat mode ──────────────────────────────────────────────────────────
  let compat: ProjectConfig['compat']
  if (args.compat) {
    compat = args.compat
  } else if (yes) {
    compat = 'none'
  } else {
    const value = await p.select({
      message: 'Migrating from another framework?',
      options: [
        { value: 'none', label: 'No — native Pyreon', hint: 'recommended' },
        { value: 'react', label: 'React', hint: 'use useState, useEffect, etc.' },
        { value: 'vue', label: 'Vue', hint: 'use ref, computed, watch, etc.' },
        { value: 'solid', label: 'Solid', hint: 'use createSignal, createEffect, etc.' },
        { value: 'preact', label: 'Preact', hint: 'use useState, signals, etc.' },
      ],
    })
    if (p.isCancel(value)) {
      p.cancel('Cancelled.')
      process.exit(0)
    }
    compat = value as ProjectConfig['compat']
  }

  // ─── Lint ─────────────────────────────────────────────────────────────────
  let lint: boolean
  if (args.lint !== undefined) {
    lint = args.lint
  } else if (yes) {
    lint = true
  } else {
    const value = await p.confirm({
      message: 'Include @pyreon/lint? (59 Pyreon-specific rules)',
      initialValue: true,
    })
    if (p.isCancel(value)) {
      p.cancel('Cancelled.')
      process.exit(0)
    }
    lint = value
  }

  return {
    name,
    targetDir,
    template,
    renderMode,
    adapter,
    features,
    packageStrategy,
    integrations,
    aiTools,
    compat,
    lint,
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Resolve the feature set per the priority order documented at the call
 * site. Exported for tests so the resolution shape can be locked
 * independently of the prompt machinery.
 */
export async function resolveFeatures(
  args: CliArgs,
  templateDefault: readonly string[],
  yes: boolean,
): Promise<string[]> {
  // 1. Explicit --features wins outright. --with/--no still compose on top
  //    so users can do `--features store,query --with-i18n`.
  if (args.features !== undefined) {
    return applyWithWithout(args.features, args)
  }

  // 2. --preset sets a starting point. Skip prompts entirely; --with/--no
  //    compose on top.
  if (args.preset) {
    return applyWithWithout([...PRESETS[args.preset].features], args)
  }

  // 3. --yes uses the template's default feature set (back-compat) plus
  //    any --with/--no overrides.
  if (yes) {
    return applyWithWithout([...templateDefault], args)
  }

  // 4. Interactive: offer a preset shortcut first; "Custom" drops to the
  //    grouped multiselect.
  const presetChoice = await p.select({
    message: 'Feature preset',
    options: [
      ...Object.entries(PRESETS).map(([id, meta]) => ({
        value: id as PresetId | 'custom',
        label: meta.label,
      })),
      {
        value: 'custom' as PresetId | 'custom',
        label: 'Custom — pick features one by one',
      },
    ],
    initialValue: 'custom' as PresetId | 'custom',
  })
  if (p.isCancel(presetChoice)) {
    p.cancel('Cancelled.')
    process.exit(0)
  }

  if (presetChoice !== 'custom') {
    return applyWithWithout([...PRESETS[presetChoice as PresetId].features], args)
  }

  // Grouped multiselect — features visually grouped by category for
  // discoverability. clack's `groupMultiselect` renders the section
  // headings inline so the user doesn't drown in a 22-option flat list.
  const grouped = buildGroupedFeatureOptions()

  const value = await p.groupMultiselect({
    message: 'Features',
    options: grouped,
    initialValues: [...templateDefault],
    required: false,
  })
  if (p.isCancel(value)) {
    p.cancel('Cancelled.')
    process.exit(0)
  }
  return applyWithWithout(value as string[], args)
}

/**
 * Build the category-grouped option list for the interactive "Custom" feature
 * picker. Every key listed in `FEATURE_CATEGORIES` MUST be defined in
 * `FEATURES` — a drift between the two crashed the picker with a cryptic
 * `Cannot read properties of undefined (reading 'label')` (the 0.33.0 custom-
 * features bug: `state-tree` / `coolgrid` were categorised but undefined).
 * Pure + exported so the integrity test exercises it directly, and a drift now
 * fails loudly here naming the offending feature instead of deep in clack.
 */
export function buildGroupedFeatureOptions(): Record<
  string,
  Array<{ value: string; label: string }>
> {
  const grouped: Record<string, Array<{ value: string; label: string }>> = {}
  for (const cat of Object.values(FEATURE_CATEGORIES)) {
    grouped[cat.label] = cat.features.map((key) => {
      const def = FEATURES[key as keyof typeof FEATURES]
      if (!def) {
        throw new Error(
          `[create-zero] feature "${key}" is listed in category "${cat.label}" ` +
            `but missing from FEATURES — fix the drift in templates.ts.`,
        )
      }
      return { value: key, label: def.label }
    })
  }
  return grouped
}

function applyWithWithout(base: string[], args: CliArgs): string[] {
  const set = new Set(base)
  for (const feat of args.withFeatures) set.add(feat)
  for (const feat of args.withoutFeatures) set.delete(feat)
  return [...set]
}

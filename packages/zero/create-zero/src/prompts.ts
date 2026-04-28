import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import * as p from '@clack/prompts'
import type { CliArgs } from './args'
import {
  type AdapterId,
  type AiToolId,
  FEATURES,
  type IntegrationId,
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
  let features: string[]
  if (args.features !== undefined) {
    features = args.features
  } else if (yes) {
    features = [...tmpl.defaultFeatures]
  } else {
    const value = await p.multiselect({
      message: 'Select features (space to toggle, enter to confirm)',
      options: Object.entries(FEATURES).map(([key, { label }]) => ({
        value: key,
        label,
      })),
      initialValues: [...tmpl.defaultFeatures],
      required: false,
    })
    if (p.isCancel(value)) {
      p.cancel('Cancelled.')
      process.exit(0)
    }
    features = value as string[]
  }

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

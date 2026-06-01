/**
 * Backend-integration application. File bodies live in
 * `templates/_shared/_integrations/<integration>/` as REAL files — the
 * scaffolder copies the overlay. Each integration contributes deps to
 * package.json (computed) and env-var keys to `.env.example`.
 *
 * Conventions:
 *   - `_shared/_integrations/<int>/` — files always copied when the
 *     integration is selected.
 *   - `_shared/_integrations/<int>/_<template>/` — additional files
 *     copied only when the user picks that template. Used by Supabase
 *     for the dashboard-specific `auth.ts` + `db.ts` (which mirror the
 *     dashboard's in-memory stub contract).
 */

import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { copyOverlay } from './template-engine'
import type { IntegrationId, ProjectConfig } from './templates'

const SHARED_INTEGRATIONS_ROOT = resolve(
  import.meta.dirname,
  '..',
  'templates',
  '_shared',
  '_integrations',
)

interface IntegrationMeta {
  id: IntegrationId
  deps(): Record<string, string>
  envKeys(): string[]
}

const META: Record<IntegrationId, IntegrationMeta> = {
  supabase: {
    id: 'supabase',
    deps: () => ({ '@supabase/supabase-js': '^2.49.0' }),
    envKeys: () => ['SUPABASE_URL', 'SUPABASE_ANON_KEY'],
  },
  email: {
    id: 'email',
    deps: () => ({
      resend: '^4.0.0',
      '@pyreon/document-primitives': 'workspace:^',
      '@pyreon/document': 'workspace:^',
      '@pyreon/connector-document': 'workspace:^',
    }),
    envKeys: () => ['RESEND_API_KEY', 'EMAIL_FROM'],
  },
}

export async function applyIntegrations(config: ProjectConfig): Promise<void> {
  for (const id of config.integrations) {
    const overlayDir = join(SHARED_INTEGRATIONS_ROOT, id)
    // Always-on files (skipping `_<template>/` subdirs).
    await copyOverlay(overlayDir, config.targetDir, {}, { skipUnderscoreDirs: true })
    // Template-conditional files (e.g. supabase/_dashboard/).
    const templateOverlay = join(overlayDir, `_${config.template}`)
    if (existsSync(templateOverlay)) {
      await copyOverlay(templateOverlay, config.targetDir)
    }
  }
  await appendEnvExample(config)
}

export function integrationDeps(config: ProjectConfig): Record<string, string> {
  const out: Record<string, string> = {}
  for (const id of config.integrations) {
    Object.assign(out, META[id].deps())
  }
  return out
}

async function appendEnvExample(config: ProjectConfig): Promise<void> {
  if (config.integrations.length === 0) return

  const lines: string[] = []
  for (const id of config.integrations) {
    const keys = META[id].envKeys()
    if (keys.length === 0) continue
    lines.push(`# ─── ${id} ───`)
    for (const k of keys) lines.push(`${k}=`)
    lines.push('')
  }

  const envPath = join(config.targetDir, '.env.example')
  let existing = ''
  try {
    existing = await readFile(envPath, 'utf-8')
  } catch (err) {
    // ENOENT is expected when the file doesn't yet exist — proceed with empty.
    // Any other error (permissions, etc.) should propagate.
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
  }
  const next = existing ? `${existing.trimEnd()}\n\n${lines.join('\n')}` : lines.join('\n')
  await writeFile(envPath, next)
}

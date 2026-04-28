import { existsSync } from 'node:fs'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { IntegrationId, ProjectConfig } from './templates'

/**
 * Backend-integration scaffolders. Each integration writes plain files into
 * the user's project — there are no Pyreon-side wrapper packages to
 * version-pin. The user owns the integration code and updates it
 * independently of Pyreon releases.
 *
 * Public surface:
 *   - `applyIntegrations(config)` — entry point called from scaffold.ts.
 *   - `integrationDeps(config)` — npm deps a given integration needs (used
 *     by `generatePackageJson` so deps get added to the scaffolded
 *     package.json with sane version pins).
 *   - `integrationEnvKeys(config)` — env-var keys appended to `.env.example`.
 */

interface IntegrationGen {
  id: IntegrationId
  /** npm deps to add to the scaffolded `package.json`. */
  deps(): Record<string, string>
  /** env-var keys to append to `.env.example`. */
  envKeys(): string[]
  /** Write all integration-specific files into `targetDir`. */
  apply(config: ProjectConfig): Promise<void>
}

// ─── Supabase ───────────────────────────────────────────────────────────────
//
// Supabase replaces the dashboard's in-memory `auth.ts` + `db.ts`. The
// exported function signatures are kept identical (signIn / signUp /
// getSession / signOut / SessionInfo, listUsers / listInvoices / …) so
// existing route imports stay valid. For non-dashboard templates the
// integration simply writes a `src/lib/supabase.ts` client + the env keys.

const supabase: IntegrationGen = {
  id: 'supabase',

  deps() {
    return { '@supabase/supabase-js': '^2.49.0' }
  },

  envKeys() {
    return ['SUPABASE_URL', 'SUPABASE_ANON_KEY']
  },

  async apply(config) {
    // Always write the bare supabase client — useful for any template.
    await writeFileEnsuringDir(
      join(config.targetDir, 'src/lib/supabase.ts'),
      supabaseClient(),
    )

    // Dashboard-specific: overwrite auth.ts + db.ts with Supabase-backed
    // implementations that match the in-memory contract.
    if (config.template === 'dashboard') {
      await writeFile(join(config.targetDir, 'src/lib/auth.ts'), supabaseAuth())
      await writeFile(join(config.targetDir, 'src/lib/db.ts'), supabaseDb())
    }
  },
}

// ─── Email (Resend + document-primitives) ──────────────────────────────────
//
// The headline Pyreon angle: the SAME component tree renders in the
// browser preview AND exports to email HTML. The scaffolder writes a
// document-primitives template + a `sendEmail()` helper + an example API
// route. Real send transport is Resend; templates are framework-Pyreon.

const email: IntegrationGen = {
  id: 'email',

  deps() {
    return {
      resend: '^4.0.0',
      '@pyreon/document-primitives': 'workspace:^',
      '@pyreon/document': 'workspace:^',
      '@pyreon/connector-document': 'workspace:^',
    }
  },

  envKeys() {
    return ['RESEND_API_KEY', 'EMAIL_FROM']
  },

  async apply(config) {
    await writeFileEnsuringDir(join(config.targetDir, 'src/lib/email.ts'), emailLib())

    await writeFileEnsuringDir(
      join(config.targetDir, 'src/emails/welcome.tsx'),
      welcomeEmailTemplate(),
    )

    // Example endpoint — sends the welcome email to a posted address.
    await writeFileEnsuringDir(
      join(config.targetDir, 'src/routes/api/email/welcome.ts'),
      welcomeEmailEndpoint(),
    )
  },
}

const REGISTRY: Record<IntegrationId, IntegrationGen> = { supabase, email }

// ─── Public surface ─────────────────────────────────────────────────────────

export async function applyIntegrations(config: ProjectConfig): Promise<void> {
  for (const id of config.integrations) {
    await REGISTRY[id].apply(config)
  }
  await appendEnvExample(config)
}

export function integrationDeps(config: ProjectConfig): Record<string, string> {
  const out: Record<string, string> = {}
  for (const id of config.integrations) {
    Object.assign(out, REGISTRY[id].deps())
  }
  return out
}

async function appendEnvExample(config: ProjectConfig): Promise<void> {
  if (config.integrations.length === 0) return

  const lines: string[] = []
  for (const id of config.integrations) {
    const keys = REGISTRY[id].envKeys()
    if (keys.length === 0) continue
    lines.push(`# ─── ${id} ───`)
    for (const k of keys) lines.push(`${k}=`)
    lines.push('')
  }

  const envPath = join(config.targetDir, '.env.example')
  const existing = existsSync(envPath) ? await readFile(envPath, 'utf-8') : ''
  const next = existing ? `${existing.trimEnd()}\n\n${lines.join('\n')}` : lines.join('\n')
  await writeFile(envPath, next)
}

async function writeFileEnsuringDir(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content)
}

// Used by callers that want to remove a stub before writing a real impl —
// kept exported in case future integrations need it.
export async function removeIfExists(path: string): Promise<void> {
  if (!existsSync(path)) return
  await unlink(path)
}

// ─── File bodies ────────────────────────────────────────────────────────────
//
// These are kept as plain string-returning functions (not template files
// on disk) so a future change to one of them lands in source review here
// rather than in a fixture directory. Each function emits a self-contained
// file body the scaffolder writes verbatim into the user's project.

function supabaseClient(): string {
  return `import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Server-side Supabase client. Uses the anon key by default; swap for the
 * service-role key inside trusted server contexts (route loaders that
 * need to bypass RLS) and pair with row-level policies in your Postgres
 * schema.
 *
 * The server reads SUPABASE_URL / SUPABASE_ANON_KEY from \`process.env\`.
 * For the browser bundle, expose the SAME values via \`publicEnv()\` so
 * client-side fetch / realtime subscriptions can connect.
 */
export const supabase: SupabaseClient = createClient(
  process.env.SUPABASE_URL ?? '',
  process.env.SUPABASE_ANON_KEY ?? '',
  { auth: { persistSession: false, detectSessionInUrl: false } },
)
`
}

function supabaseAuth(): string {
  return `import { supabase } from './supabase'

/**
 * Supabase-backed auth implementation. Mirrors the in-memory stub's
 * exported surface (signIn / signUp / getSession / signOut / SessionInfo)
 * so route guards don't change when swapping backends.
 */

export interface SessionInfo {
  userId: string
  email: string
}

export async function signUp(
  email: string,
  password: string,
): Promise<{ sessionId: string } | { error: string }> {
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) return { error: error.message }
  if (!data.session) return { error: 'Email confirmation required — check your inbox.' }
  return { sessionId: data.session.access_token }
}

export async function signIn(
  email: string,
  password: string,
): Promise<{ sessionId: string } | { error: string }> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { error: error.message }
  return { sessionId: data.session.access_token }
}

export async function getSession(sessionId: string | undefined): Promise<SessionInfo | null> {
  if (!sessionId) return null
  const { data, error } = await supabase.auth.getUser(sessionId)
  if (error || !data.user) return null
  return { userId: data.user.id, email: data.user.email ?? '' }
}

export async function signOut(sessionId: string): Promise<void> {
  // Supabase tokens are JWTs; revocation is server-mediated. We invalidate
  // the access token by calling \`supabase.auth.admin.signOut(sessionId)\`
  // when the service-role key is available; otherwise fall back to a
  // client-side cookie clear (handled by the route).
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    await supabase.auth.admin.signOut(sessionId)
  }
}
`
}

function supabaseDb(): string {
  return `import { supabase } from './supabase'

/**
 * Supabase-backed data layer. Mirrors the in-memory stub's exported
 * surface (User / Invoice / listUsers / listInvoices / invoiceById /
 * invoiceTotal) so dashboard routes don't change when swapping backends.
 *
 * Schema expected in your Supabase Postgres:
 *
 *   create table public.users (
 *     id uuid primary key,
 *     email text not null,
 *     name text not null,
 *     role text not null check (role in ('admin','member')),
 *     created_at timestamptz not null default now()
 *   );
 *
 *   create table public.invoices (
 *     id text primary key,
 *     number text not null,
 *     customer jsonb not null,
 *     items jsonb not null,
 *     status text not null check (status in ('draft','pending','paid')),
 *     issued_at timestamptz not null default now()
 *   );
 */

export interface User {
  id: string
  email: string
  name: string
  role: 'admin' | 'member'
  createdAt: Date
}

export interface InvoiceItem {
  description: string
  qty: number
  unitPrice: number
}

export interface Invoice {
  id: string
  number: string
  customer: { name: string; email: string; address: string }
  items: InvoiceItem[]
  status: 'draft' | 'pending' | 'paid'
  issuedAt: Date
}

export async function listUsers(): Promise<User[]> {
  const { data, error } = await supabase.from('users').select('*')
  if (error) throw error
  return data.map((row) => ({
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    createdAt: new Date(row.created_at),
  }))
}

export async function listInvoices(): Promise<Invoice[]> {
  const { data, error } = await supabase.from('invoices').select('*')
  if (error) throw error
  return data.map(rowToInvoice)
}

export async function invoiceById(id: string): Promise<Invoice | undefined> {
  const { data, error } = await supabase.from('invoices').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data ? rowToInvoice(data) : undefined
}

export function invoiceTotal(inv: Invoice): number {
  return inv.items.reduce((sum, i) => sum + i.qty * i.unitPrice, 0)
}

function rowToInvoice(row: any): Invoice {
  return {
    id: row.id,
    number: row.number,
    customer: row.customer,
    items: row.items,
    status: row.status,
    issuedAt: new Date(row.issued_at),
  }
}
`
}

function emailLib(): string {
  return `import { Resend } from 'resend'
import { extractDocNode } from '@pyreon/connector-document'
import { render } from '@pyreon/document'
import type { ComponentFn } from '@pyreon/core'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = process.env.EMAIL_FROM ?? 'noreply@example.com'

/**
 * Send an email rendered from a Pyreon \`@pyreon/document-primitives\`
 * template. The same template renders in the browser preview AND exports
 * to email HTML — that is the headline Pyreon angle: one component tree,
 * many output formats.
 */
export async function sendEmail<TProps>(opts: {
  to: string | string[]
  subject: string
  template: ComponentFn<TProps>
  data: TProps
}): Promise<{ id: string } | { error: string }> {
  const node = extractDocNode(() => opts.template(opts.data))
  const html = (await render(node, 'email')) as string

  const { data, error } = await resend.emails.send({
    from: FROM,
    to: opts.to,
    subject: opts.subject,
    html,
  })

  if (error) return { error: error.message }
  return { id: data?.id ?? 'unknown' }
}
`
}

function welcomeEmailTemplate(): string {
  return `import {
  DocDocument,
  DocPage,
  DocSection,
  DocHeading,
  DocText,
  DocSpacer,
} from '@pyreon/document-primitives'

export interface WelcomeEmailProps {
  name: string
  appUrl: string
}

/**
 * Welcome email template. Renders in the browser AND exports to email
 * HTML via \`@pyreon/document-primitives\` — the SAME component tree.
 *
 * Try it: in dev, visit \`/api/email/welcome?to=you@example.com\`. In
 * production, call \`sendEmail({ to, subject, template: WelcomeEmail,
 * data: { name, appUrl } })\` from any server route.
 */
export default function WelcomeEmail(props: WelcomeEmailProps) {
  return (
    <DocDocument title="Welcome" subject="Welcome to your new account">
      <DocPage>
        <DocSection>
          <DocHeading level={1}>Welcome, {props.name}.</DocHeading>
        </DocSection>

        <DocSpacer />

        <DocSection>
          <DocText>
            Your account is ready. The dashboard is the fastest way to get started — log
            in any time at:
          </DocText>
          <DocText>{props.appUrl}</DocText>
        </DocSection>

        <DocSpacer />

        <DocSection>
          <DocText>If you didn't create this account, ignore this email.</DocText>
        </DocSection>
      </DocPage>
    </DocDocument>
  )
}
`
}

function welcomeEmailEndpoint(): string {
  return `import { sendEmail } from '../../../lib/email'
import WelcomeEmail from '../../../emails/welcome'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const to = url.searchParams.get('to')
  if (!to) {
    return new Response(JSON.stringify({ error: 'Missing ?to=' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })
  }

  const appUrl = url.origin

  const result = await sendEmail({
    to,
    subject: 'Welcome',
    template: WelcomeEmail,
    data: { name: to.split('@')[0] ?? 'friend', appUrl },
  })

  return new Response(JSON.stringify(result), {
    headers: { 'content-type': 'application/json' },
  })
}
`
}

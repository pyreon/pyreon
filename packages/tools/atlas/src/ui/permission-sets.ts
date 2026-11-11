/**
 * Permission sets — render a scenario as each role sees it.
 *
 * The bug this exists to catch is a security bug: an action that should be
 * admin-only rendering for a viewer. It is normally found by logging in as the
 * wrong user, which means it is normally found late — or in production.
 *
 * A workbench can answer it directly, because the component under test already
 * reads `can(...)` from context. Swap the set, re-render, and the difference IS
 * the audit. Storybook can do the swap too; what it cannot do is say WHICH keys
 * the component consulted, because nothing records the reads. Here they are
 * recorded, which turns "it looks the same" into "it never asked".
 *
 * ── Why a role is a POLICY, not a PermissionMap ───────────────────────────
 *
 * `@pyreon/permissions` recognises exactly three wildcard shapes: `'*'`
 * (global), `'prefix.*'` (one segment), `'prefix.**'` (any depth). Everything
 * else — including `'**'` and `'*.read'` — is an EXACT key. So "a viewer may
 * read anything" is not expressible as a static map without already knowing the
 * project's key vocabulary, which Atlas does not.
 *
 * A role is therefore a policy over the key's VERB (its last segment) plus a
 * default. Keys are seeded into a real `createPermissions` instance as the
 * component consults them, so the engine still does resolution and `can.not` /
 * `can.all` / `can.any` behave exactly as they would in the app.
 */
import { createPermissions, type Permissions } from '@pyreon/permissions'

/** A named role the preview can be rendered under. */
export interface PermissionSet {
  id: string
  label: string
  /** One line on who this represents — shown next to the tab. */
  hint: string
  /** Verbs (final key segment) this role may perform. */
  verbs: readonly string[]
  /**
   * EXACT keys this role is granted, checked before the verb heuristic. The
   * seam a project's own roles (from `atlas.config.ts`) use when their model
   * is key-based rather than verb-based.
   */
  grants?: readonly string[]
  /** Verdict for a key whose verb is not listed. */
  defaultGrant: boolean
}

/** Read-ish verbs, kept in one place so the roles below compose from it. */
const READ_VERBS = ['read', 'list', 'view', 'get', 'show', 'index'] as const
const WRITE_VERBS = ['create', 'update', 'edit', 'write', 'save'] as const

/**
 * Default roles, least- to most-privileged.
 *
 * A project with a real permission model passes its own sets in; these exist so
 * the panel is useful on day one without configuration.
 */
export const DEFAULT_PERMISSION_SETS: readonly PermissionSet[] = [
  { id: 'anonymous', label: 'Anonymous', hint: 'signed out — nothing granted', verbs: [], defaultGrant: false },
  { id: 'viewer', label: 'Viewer', hint: 'read-only', verbs: READ_VERBS, defaultGrant: false },
  {
    id: 'editor',
    label: 'Editor',
    hint: 'read + write, nothing destructive',
    verbs: [...READ_VERBS, ...WRITE_VERBS],
    defaultGrant: false,
  },
  { id: 'admin', label: 'Admin', hint: 'everything granted', verbs: [], defaultGrant: true },
]

export function permissionSetById(id: string): PermissionSet {
  return DEFAULT_PERMISSION_SETS.find((s) => s.id === id) ?? DEFAULT_PERMISSION_SETS[0]!
}

/** The role's verdict for one key, before the engine sees it. */
export function grants(set: PermissionSet, key: string): boolean {
  if (set.grants?.includes(key)) return true
  const verb = key.includes('.') ? key.slice(key.lastIndexOf('.') + 1) : key
  return set.verbs.includes(verb) ? true : set.defaultGrant
}

/**
 * A `Permissions` instance that RECORDS every key it was asked about.
 *
 * The recording is the point. Rendering under four roles tells you the output
 * differs; knowing which keys were consulted tells you whether the component
 * asked at all — and a component that never calls `can()` for a destructive
 * action is not "permission-safe", it is unguarded. A plain swap-and-look
 * cannot distinguish those two.
 */
export interface RecordingPermissions {
  can: Permissions
  /** Keys the component consulted, in first-seen order. */
  consulted(): string[]
  /** Keys consulted that this role was DENIED. */
  denied(): string[]
}

export function recordingPermissions(set: PermissionSet): RecordingPermissions {
  // The engine owns resolution; the policy only seeds exact keys on first sight.
  // `'*'` carries the default so a key checked through a forwarded helper
  // (`can.all`, which does not pass through the wrapper) still resolves sanely.
  const base = createPermissions({ '*': set.defaultGrant })
  const seen: string[] = []
  const deniedKeys = new Set<string>()

  const seed = (key: string): void => {
    if (seen.includes(key)) return
    seen.push(key)
    const granted = grants(set, key)
    if (!granted) deniedKeys.add(key)
    base.patch({ [key]: granted })
  }

  const can = ((key: string, context?: unknown) => {
    seed(key)
    return base(key, context)
  }) as Permissions

  // Forward the rest of the surface. Dropping `can.not` / `can.all` / `can.set`
  // would change the behaviour of the component under test, which would make
  // every verdict here worthless.
  //
  // Through `unknown`: `Permissions` is a callable with named members and no
  // index signature, so a direct cast is rejected. The copy is deliberately
  // key-agnostic — enumerating members would silently stop forwarding one the
  // day `@pyreon/permissions` adds it.
  const src = base as unknown as Record<string, unknown>
  const dst = can as unknown as Record<string, unknown>
  for (const key of Object.keys(src)) dst[key] = src[key]

  // The KEY-TAKING helpers are then re-wrapped, because a component is as
  // likely to write `can.any('posts.update', 'posts.delete')` as `can(...)`.
  // Forwarding them unwrapped meant those keys were never seeded, so they fell
  // through to the `'*'` default — the role's policy silently did not apply,
  // and the keys were missing from the consulted list that the "it never
  // asked" finding depends on.
  can.not = (key: string, context?: unknown) => {
    seed(key)
    return base.not(key, context)
  }
  // Both call shapes: rest keys, or an array plus a context
  // (`can.all(['a', 'b'], post)`). The array form's keys must be seeded too,
  // or its checks bypass the role's policy exactly like an unwrapped helper.
  const multiKeys = (args: unknown[]): string[] =>
    Array.isArray(args[0]) ? (args[0] as string[]) : (args as string[])
  can.all = ((...args: unknown[]) => {
    for (const key of multiKeys(args)) seed(key)
    return (base.all as (...a: unknown[]) => boolean)(...args)
  }) as Permissions['all']
  can.any = ((...args: unknown[]) => {
    for (const key of multiKeys(args)) seed(key)
    return (base.any as (...a: unknown[]) => boolean)(...args)
  }) as Permissions['any']
  can.assert = (key: string, context?: unknown, message?: string) => {
    seed(key)
    return base.assert(key, context, message)
  }

  return {
    can,
    consulted: () => [...seen],
    denied: () => seen.filter((k) => deniedKeys.has(k)),
  }
}

/** What changed between two roles, for one component. */
export interface PermissionDiff {
  /** granted in `b` but not `a` */
  gained: string[]
  /** granted in `a` but not `b` */
  lost: string[]
  /** neither role was granted */
  alwaysDenied: string[]
}

export function diffSets(
  a: { consulted: readonly string[]; denied: readonly string[] },
  b: { consulted: readonly string[]; denied: readonly string[] },
): PermissionDiff {
  const aDenied = new Set(a.denied)
  const bDenied = new Set(b.denied)
  const keys = [...new Set([...a.consulted, ...b.consulted])]
  return {
    gained: keys.filter((k) => aDenied.has(k) && !bDenied.has(k)),
    lost: keys.filter((k) => !aDenied.has(k) && bDenied.has(k)),
    alwaysDenied: keys.filter((k) => aDenied.has(k) && bDenied.has(k)),
  }
}

/**
 * The finding with teeth: the component consulted NOTHING.
 *
 * Rendering identically under every role is only reassuring if the component
 * asked and was answered the same way. If it never asked, the roles prove
 * nothing — and that is exactly what an unguarded action looks like.
 */
export function isUnguarded(consulted: readonly string[]): boolean {
  return consulted.length === 0
}

// ── Every role side by side ───────────────────────────────────────────────

/** Verbs that destroy or revoke — the actions a role policy most often withholds. */
const DESTRUCTIVE_VERBS = ['delete', 'remove', 'destroy', 'archive', 'purge', 'revoke', 'ban'] as const

/**
 * Every verb the action check recognises. An action whose first word is not
 * one of these ("Share", "Cancel", "Button") is not judged: nothing says
 * which permission it needs, and guessing would flag every label.
 */
export const ACTION_VERBS: ReadonlySet<string> = new Set([...READ_VERBS, ...WRITE_VERBS, ...DESTRUCTIVE_VERBS])

/** The verb a key ends in (`posts.delete` → `delete`). */
export function verbOf(key: string): string {
  return (key.includes('.') ? key.slice(key.lastIndexOf('.') + 1) : key).toLowerCase()
}

/** An enabled, interactive element a role's render produced. */
export interface RenderedAction {
  /** Its accessible name, as a user reads it. */
  name: string
  /** The recognised verb its name starts with, or `null`. */
  verb: string | null
}

const ACTION_SELECTOR =
  'button, a[href], [role="button"], [role="menuitem"], [role="link"], input[type="submit"], input[type="button"]'

/**
 * The enabled actions inside `root`, by accessible name.
 *
 * A DISABLED action is left out: rendering "Delete" greyed-out for a viewer is
 * the usual way to say "you may not", not a leak. So is anything hidden from
 * assistive tech or carrying no name at all.
 */
export function renderedActions(root: Element): RenderedAction[] {
  const out: RenderedAction[] = []
  for (const el of root.querySelectorAll(ACTION_SELECTOR)) {
    if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') continue
    if (el.closest('[aria-hidden="true"], [hidden]')) continue
    const name = (el.getAttribute('aria-label') ?? (el as HTMLInputElement).value ?? '').trim() ||
      (el.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (!name) continue
    const first = name.split(' ')[0]!.toLowerCase().replace(/[^a-z]/g, '')
    out.push({ name, verb: ACTION_VERBS.has(first) ? first : null })
  }
  return out
}

/** One role's verdict, as its card shows it. */
export interface RoleVerdict {
  /**
   * `ok` — every judged action is one the role may take · `violation` — an
   * action rendered that the role may not take · `unguarded` — the component
   * consulted no key at all, so the roles prove nothing about it.
   */
  state: 'ok' | 'violation' | 'unguarded'
  message: string
}

/** "admin only" / "editor, admin" / "no role" — who the policy lets do `verb`. */
export function policyFor(verb: string, roles: readonly PermissionSet[]): string {
  const allowed = roles.filter((r) => grants(r, verb)).map((r) => r.label.toLowerCase())
  if (allowed.length === 0) return 'no role'
  if (allowed.length === 1) return `${allowed[0]} only`
  return allowed.join(', ')
}

/**
 * Judge one role's render against its policy.
 *
 * Each rendered action with a recognised verb is checked twice over:
 *
 * 1. If the component CONSULTED a key with that verb (`can('posts.delete')`),
 *    the engine's answer for this role decides — an action rendered although
 *    every such key was denied is a guard that is not wired to what it guards.
 * 2. If it consulted none, the role's own policy decides (`grants(role, verb)`)
 *    — an action rendered for a role the policy withholds it from, with no
 *    check behind it, is the unguarded action this panel exists to catch.
 *
 * A component that consulted no key at all is `unguarded` regardless: every
 * role sees the same output, and that proves nothing.
 */
export function judgeRole(
  role: PermissionSet,
  roles: readonly PermissionSet[],
  consulted: readonly string[],
  denied: readonly string[],
  actions: readonly RenderedAction[],
): RoleVerdict {
  if (consulted.length === 0) {
    return { state: 'unguarded', message: 'consulted no permission key — the same output for every role' }
  }
  const deniedSet = new Set(denied)
  for (const action of actions) {
    if (!action.verb) continue
    const keys = consulted.filter((k) => verbOf(k) === action.verb)
    if (keys.length > 0) {
      if (keys.every((k) => deniedSet.has(k))) {
        return {
          state: 'violation',
          message: `"${action.name}" rendered for ${role.label.toLowerCase()} although can('${keys[0]}') was denied`,
        }
      }
      continue
    }
    if (!grants(role, action.verb)) {
      return {
        state: 'violation',
        message: `"${action.name}" rendered for ${role.label.toLowerCase()} with no can() check · policy: ${policyFor(action.verb, roles)}`,
      }
    }
  }
  const judged = actions.filter((a) => a.verb).length
  return {
    state: 'ok',
    message: judged === 0 ? 'no action it could be denied rendered' : 'matches policy',
  }
}

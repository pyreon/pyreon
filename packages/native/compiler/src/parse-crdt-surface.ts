/**
 * `@pyreon/sync` CRDT surface totality — warn when a member of the web
 * `CrdtDoc` / `CrdtMap` contract has NO native counterpart.
 *
 * WHY THIS EXISTS. PMTC has no special lowering for these members: a call like
 * `doc.transact(() => {...})` falls through to the generic member-call emit and
 * is reproduced VERBATIM into Swift/Kotlin. When the member does not exist on
 * the native runtime the result is a compiler error inside a GENERATED file,
 * naming a method the user never wrote in that language — the worst place to
 * meet it, and with no diagnostic pointing at the call site that caused it.
 *
 * That is the same class this file's neighbours already name for `createMachine`
 * / `createI18n` / `syncedSignal` at module scope ("printed the call VERBATIM
 * into Swift/Kotlin with ZERO diagnostics"). This is its member-call variant.
 *
 * The classification below is TOTAL over the web contract, not a hand-list:
 * `crdt-surface-totality.test.ts` parses `CrdtDoc` / `CrdtMap` out of
 * `@pyreon/sync`'s own `crdt/types.ts` and fails if any member is missing from
 * these records. A hand-maintained allowlist rots silently the moment the web
 * interface grows a member; a total record fails until someone classifies it.
 */

type AnyNode = Record<string, any>

/** Every `CrdtDoc` member, classified by whether the native runtimes have it. */
export const CRDT_DOC_SURFACE: Record<'getMap' | 'transact' | 'destroy', boolean> = {
  // Shipped on both runtimes as `PyreonCrdtDoc.getMap(_:)` returning a
  // `PyreonCrdtMap` handle.
  getMap: true,
  // NOT lowered. The native engine is a flat LWW op log with no transaction
  // batching, so there is nothing for a `transact` to group. This one is not
  // cosmetic: the web contract states writes MUST happen inside it.
  transact: false,
  // NOT lowered. The native doc holds no resources needing an explicit teardown.
  destroy: false,
}

/** Every `CrdtMap` member, classified the same way. */
export const CRDT_MAP_SURFACE: Record<
  'get' | 'set' | 'has' | 'keys' | 'observe',
  boolean
> = { get: true, set: true, has: true, keys: true, observe: true }

const DOC_REMEDY: Record<string, string> = {
  transact:
    'the native engine is a flat LWW op log with no transaction batching. Write the keys ' +
    'directly (`map.set(...)`) — each write is its own op and converges the same way; you ' +
    'lose only the group-observers-once semantic.',
  destroy:
    'the native doc holds no resources needing teardown — drop the call, or guard it behind ' +
    '`isServer`/a web-only module if you need it on web.',
}

function isCrdtDocCtor(init: AnyNode | undefined): boolean {
  return (
    !!init &&
    init.type === 'NewExpression' &&
    (init.callee?.name as string | undefined) === 'PyreonCrdtDoc'
  )
}

/** `X.getMap(...)` where `X` is a known doc binding. */
function isGetMapCall(init: AnyNode | undefined, docNames: Set<string>): boolean {
  if (!init || init.type !== 'CallExpression') return false
  const callee = init.callee as AnyNode | undefined
  if (!callee || callee.type !== 'MemberExpression') return false
  if ((callee.property?.name as string | undefined) !== 'getMap') return false
  return docNames.has((callee.object?.name as string | undefined) ?? '')
}

/**
 * Collect binding names for CRDT docs and map handles. Deliberately
 * IDENTIFIER-ONLY: a receiver we cannot resolve to a binding is left alone, so
 * an unknown shape costs a missed warning rather than a false one on somebody
 * else's `.transact`.
 */
function collectBindings(
  node: AnyNode,
  docNames: Set<string>,
  mapNames: Set<string>,
): void {
  if (!node || typeof node !== 'object') return
  if (node.type === 'VariableDeclarator') {
    const name = node.id?.type === 'Identifier' ? (node.id.name as string) : undefined
    if (name) {
      if (isCrdtDocCtor(node.init)) docNames.add(name)
      else if (isGetMapCall(node.init, docNames)) mapNames.add(name)
    }
  }
  for (const key of Object.keys(node)) {
    if (key === 'parent') continue
    const child = node[key]
    if (Array.isArray(child)) {
      for (const c of child) if (c && typeof c === 'object') collectBindings(c, docNames, mapNames)
    } else if (child && typeof child === 'object') {
      collectBindings(child as AnyNode, docNames, mapNames)
    }
  }
}

function checkCalls(
  node: AnyNode,
  docNames: Set<string>,
  mapNames: Set<string>,
  seen: Set<string>,
  warnings: string[],
): void {
  if (!node || typeof node !== 'object') return
  if (node.type === 'CallExpression') {
    const callee = node.callee as AnyNode | undefined
    if (callee?.type === 'MemberExpression' && !callee.computed) {
      const recv = callee.object?.name as string | undefined
      const member = callee.property?.name as string | undefined
      if (recv && member) {
        const onDoc = docNames.has(recv)
        const onMap = mapNames.has(recv)
        if (onDoc || onMap) {
          const surface: Record<string, boolean> = onDoc ? CRDT_DOC_SURFACE : CRDT_MAP_SURFACE
          const kind = onDoc ? 'CrdtDoc' : 'CrdtMap'
          // Only a member the WEB contract defines and native lacks. An unknown
          // member is somebody else's API on a same-named binding — not ours to
          // claim.
          if (member in surface && !surface[member]) {
            const key = `${kind}.${member}`
            if (!seen.has(key)) {
              seen.add(key)
              const remedy = DOC_REMEDY[member] ?? 'there is no native counterpart.'
              warnings.push(
                `\`${recv}.${member}(...)\` — \`${kind}.${member}\` is part of the web ` +
                  `@pyreon/sync contract but has NO native counterpart, and PMTC reproduces ` +
                  `the call VERBATIM, so the Swift/Kotlin build will fail on a method you ` +
                  `never wrote in that language. Instead: ${remedy}`,
              )
            }
          }
        }
      }
    }
  }
  for (const key of Object.keys(node)) {
    if (key === 'parent') continue
    const child = node[key]
    if (Array.isArray(child)) {
      for (const c of child) if (c && typeof c === 'object') checkCalls(c, docNames, mapNames, seen, warnings)
    } else if (child && typeof child === 'object') {
      checkCalls(child as AnyNode, docNames, mapNames, seen, warnings)
    }
  }
}

/**
 * Scan a parsed program for calls to web-only CRDT members. One warning per
 * distinct member, so a loop writing through `transact` does not produce N
 * copies of the same advice.
 */
export function warnUnlowerdCrdtMembers(
  program: AnyNode,
  warnings: string[],
  source?: string,
): void {
  // Cheap gate FIRST. Without it this walks the entire AST of every file PMTC
  // ever parses, to answer "no" for essentially all of them. `PyreonCrdtDoc` is
  // the only way to get a doc binding, so its absence from the source text is a
  // sound bail — and a substring test is orders of magnitude cheaper than a
  // recursive walk.
  if (source !== undefined && !source.includes('PyreonCrdtDoc')) return
  const docNames = new Set<string>()
  const mapNames = new Set<string>()
  collectBindings(program, docNames, mapNames)
  if (docNames.size === 0 && mapNames.size === 0) return
  checkCalls(program, docNames, mapNames, new Set<string>(), warnings)
}

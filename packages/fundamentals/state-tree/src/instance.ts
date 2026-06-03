import { batch, signal, type Signal } from '@pyreon/reactivity'
import { formatIssues } from '@pyreon/validation'
import type { NormalizedConfig } from './model'
import { runAction } from './middleware'
import { onPatch, trackedSignal } from './patch'
import { instanceMeta } from './registry'
import type { InstanceMeta, StateShape } from './types'
import { MODEL_BRAND, RESERVED_SCHEMA_HELPER_KEYS } from './types'

// ─── Model definition detection ───────────────────────────────────────────────

interface AnyModelDef {
  readonly [MODEL_BRAND]: true
  readonly _config: NormalizedConfig<StateShape>
}

function isModelDef(v: unknown): v is AnyModelDef {
  if (v == null || typeof v !== 'object') return false
  return (v as Record<string, unknown>)[MODEL_BRAND] === true
}

// ─── Plain-object detection + deep merge (used by schema-mode deepPatch) ────

/**
 * Detect a plain object (literal `{}` or `Object.create(null)`) — used by
 * `deepMerge` to decide whether to recurse or replace. Arrays, class
 * instances, Maps, Sets, Dates, Promises etc. are NOT plain objects and
 * REPLACE rather than merge.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value == null || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === null || proto === Object.prototype
}

/**
 * Recursively merge `source` into `target` for plain-object branches.
 * Returns a NEW object — never mutates inputs. Used by `deepPatch`.
 *
 * - Plain object × plain object → recurse
 * - Anything else (array, class instance, primitive, null, undefined) →
 *   `source` value wins (replace semantics). Matches Vue 3 `reactive` /
 *   Lodash `_.merge` (without array-index merging) — the convention
 *   users expect for "deep-update this nested thing." Parallel to
 *   `@pyreon/store`'s `deepMerge`.
 */
function deepMerge(target: unknown, source: unknown): unknown {
  if (!isPlainObject(target) || !isPlainObject(source)) return source
  const out: Record<string, unknown> = { ...target }
  for (const key of Object.keys(source)) {
    out[key] =
      isPlainObject(target[key]) && isPlainObject(source[key])
        ? deepMerge(target[key], source[key])
        : source[key]
  }
  return out
}

// ─── createInstance ───────────────────────────────────────────────────────────

/**
 * Create a live model instance from a normalized config + optional initial
 * snapshot. Called by `ModelDefinition.create()`.
 *
 * Lifecycle (in order):
 *   1. Resolve state defaults — plain mode uses `_config.state`; schema mode
 *      runs the parser against `_parsedInitial` ∪ caller-supplied `initial`.
 *   2. Allocate per-field signals (each wrapped with `trackedSignal` so that
 *      writes emit JSON patches).
 *   3. Install schema-mode helpers (`set` / `patch` / `reset`) on the
 *      instance when `_parseFn` is configured.
 *   4. Run every view factory in registration order, merging onto `self`.
 *      Each factory sees prior views + actions via the live `self` proxy.
 *   5. Run every action factory in registration order, wrapping each
 *      returned function in `runAction` for middleware interception.
 */
export function createInstance(
  config: NormalizedConfig<StateShape>,
  initial: Partial<StateShape>,
): Record<string, unknown> {
  // Raw object that will become the instance.
  const instance: Record<string, unknown> = {}

  // Metadata for this instance.
  const meta: InstanceMeta = {
    stateKeys: [],
    patchListeners: new Set(),
    middlewares: [],
    emitPatch(patch) {
      // Guard avoids iterating an empty Set on the hot signal-write path.
      if (this.patchListeners.size === 0) return
      for (const listener of this.patchListeners) listener(patch)
    },
  }
  instanceMeta.set(instance, meta)

  // `self` is a live proxy so that actions/views always see the final
  // (fully-populated) instance — including methods added by later chain
  // layers and the schema-mode `set / patch / reset` helpers.
  const self = new Proxy(instance, {
    get(_, k) {
      return instance[k as string]
    },
  })

  // ── 1. Determine the per-field allocation source ──────────────────────────
  // Schema mode: the parsed value is the authoritative source (schemas
  // can't describe ModelDefinitions, so every field is a plain value).
  // Plain mode: iterate `config.state` because it carries the *structural*
  // shape — keys point at either plain defaults or `ModelDefinition`
  // sentinels. The caller's `initial[key]` overrides plain values OR
  // feeds into nested `.create()` calls.
  let allocationSource: Record<string, unknown>
  let initialSnapshotForReset: Record<string, unknown>

  if (config._parseFn) {
    const callerProvided = Object.keys(initial).length > 0
    const candidate = callerProvided
      ? { ...config._parsedInitial, ...initial }
      : config._parsedInitial
    if (candidate === undefined) {
      throw new Error(
        '[Pyreon] model({ schema }).create(): no `initial` value available. ' +
          'Either pass `initial` to `model({ schema, initial })` at definition ' +
          'time, or pass it to `.create({...})`. Schema mode cannot allocate ' +
          'signals without a starting value.',
      )
    }
    const result = config._parseFn(candidate)
    if (result instanceof Promise) {
      throw new Error(
        '[Pyreon] model.create(): schema returned a Promise from `parse`. ' +
          'Async schemas are unsupported — use a synchronous validator.',
      )
    }
    if (!result.ok) {
      const message = formatIssues(result.issues, 'init')
      if (config._onValidationError) {
        config._onValidationError(result.issues, 'init')
        // Fall back to the parsed initial captured at definition time so
        // the instance still constructs cleanly.
        if (config._parsedInitial === undefined) {
          throw new Error(message)
        }
        allocationSource = config._parsedInitial as Record<string, unknown>
      } else {
        throw new Error(message)
      }
    } else {
      allocationSource = result.value as Record<string, unknown>
    }
    // Capture the parsed-initial for `reset`. JSON clone ensures
    // subsequent in-place mutations don't poison the reset value.
    initialSnapshotForReset = JSON.parse(JSON.stringify(allocationSource))
  } else {
    // Plain mode — STRUCTURAL source is `config.state` (keys + ModelDef
    // sentinels). Caller's `initial` is consulted per-key in the loop.
    allocationSource = (config.state as Record<string, unknown>) ?? {}
    initialSnapshotForReset = {}
  }

  // ── 2. State signals ──────────────────────────────────────────────────────
  // Per-state-key signal allocation at instance CREATION (createInstance
  // runs once per model instance), not per-render — this is the model's
  // fine-grained reactive architecture, not the signal-in-render-loop
  // anti-pattern the rule targets. Disabled per-site below with rationale.
  //
  // Reserved-name check (schema mode only): schema field names can't
  // collide with mutation helper names — `set` / `patch` / `deepPatch` /
  // `update` / `reset`. Plain mode skips this check because plain models
  // have no installed mutation helpers (state is the API surface).
  const isSchemaMode = config._parseFn !== undefined
  if (isSchemaMode) {
    for (const reserved of RESERVED_SCHEMA_HELPER_KEYS) {
      if (reserved in allocationSource) {
        throw new Error(
          `[Pyreon] model({ schema }): schema field "${reserved}" collides ` +
            'with a reserved mutation helper name. Rename the field — schema mode ' +
            'installs `set` / `patch` / `deepPatch` / `update` / `reset` as bare ' +
            'methods on the instance (parallel to @pyreon/store). Direct signal ' +
            'writes are still available via `self.fieldName.set(v)` as an escape ' +
            'hatch, but the schema field cannot use one of the reserved names.',
        )
      }
    }
  }
  for (const [key, defaultValue] of Object.entries(allocationSource)) {
    meta.stateKeys.push(key)
    const path = `/${key}`

    // For plain mode: caller's `initial[key]` overrides the default OR
    // feeds into nested model creation. For schema mode: the parsed
    // value at `allocationSource[key]` IS the initial — caller overrides
    // were already merged into `candidate` before parsing.
    const callerOverride = (initial as Record<string, unknown>)[key]
    const hasCallerOverride = key in initial && callerOverride !== undefined

    let rawSig: Signal<unknown>

    if (!isSchemaMode && isModelDef(defaultValue)) {
      // Plain-mode nested model — instantiate from caller's snapshot for
      // this key (or empty for defaults).
      const nestedInitial =
        hasCallerOverride && typeof callerOverride === 'object'
          ? (callerOverride as Record<string, unknown>)
          : {}
      const nestedInstance = createInstance(defaultValue._config, nestedInitial)
      // pyreon-lint-disable-next-line pyreon/no-signal-in-loop
      rawSig = signal(nestedInstance)

      // Capture the nested SNAPSHOT (not the live instance) for reset.
      initialSnapshotForReset[key] = nestedInitial

      // Propagate nested patches upward with the key as path prefix.
      onPatch(nestedInstance, (patch) => {
        meta.emitPatch({ ...patch, path: path + patch.path })
      })
    } else {
      // Plain leaf OR schema-mode field.
      const value = isSchemaMode ? defaultValue : hasCallerOverride ? callerOverride : defaultValue
      // pyreon-lint-disable-next-line pyreon/no-signal-in-loop
      rawSig = signal(value)
      if (!isSchemaMode) initialSnapshotForReset[key] = value
    }

    const tracked = trackedSignal(
      rawSig,
      path,
      (p) => meta.emitPatch(p),
      () => meta.patchListeners.size > 0,
    )
    instance[key] = tracked
  }

  // ── 3. Schema-mode helpers ────────────────────────────────────────────────
  // Install set / patch / deepPatch / update / reset when schema mode is
  // active. Each helper validates the merged result via the schema before
  // writing to signals; direct signal writes (`self.field.set(v)`) bypass
  // validation by design (documented escape hatch, parallel to @pyreon/store).
  // Reserved-name collision check ran above (state allocation phase).
  if (config._parseFn) {
    const parseFn = config._parseFn
    const onErr = config._onValidationError
    const stateKeys = meta.stateKeys

    const validateOrFail = (
      candidate: Record<string, unknown>,
      op: string,
    ): Record<string, unknown> | undefined => {
      const result = parseFn(candidate)
      if (result instanceof Promise) {
        throw new Error(
          `[Pyreon] model.${op}(): schema returned a Promise from \`parse\`. ` +
            'Async schemas are unsupported.',
        )
      }
      if (!result.ok) {
        const message = formatIssues(result.issues, op)
        if (onErr) {
          onErr(result.issues, op)
          return undefined
        }
        throw new Error(message)
      }
      return result.value as Record<string, unknown>
    }

    const readCurrent = (): Record<string, unknown> => {
      const out: Record<string, unknown> = {}
      for (const k of stateKeys) {
        const s = instance[k] as Signal<unknown>
        out[k] = s.peek()
      }
      return out
    }

    const writeAll = (next: Record<string, unknown>): void => {
      batch(() => {
        for (const k of stateKeys) {
          const s = instance[k] as Signal<unknown>
          if (!Object.is(s.peek(), next[k])) {
            s.set(next[k])
          }
        }
      })
    }

    instance.set = (next: Record<string, unknown>) => {
      const valid = validateOrFail(next, 'set')
      if (valid === undefined) return // suppressed via onValidationError
      writeAll(valid)
    }

    instance.patch = (partial: Record<string, unknown>) => {
      const merged = { ...readCurrent(), ...partial }
      const valid = validateOrFail(merged, 'patch')
      if (valid === undefined) return
      writeAll(valid)
    }

    instance.deepPatch = (partial: Record<string, unknown>) => {
      // Recursive plain-object merge. Arrays / class instances REPLACE.
      // Parallel to @pyreon/store's `deepPatch`.
      const merged = deepMerge(readCurrent(), partial) as Record<string, unknown>
      const valid = validateOrFail(merged, 'deepPatch')
      if (valid === undefined) return
      writeAll(valid)
    }

    instance.update = (key: string, transformer: (current: unknown) => unknown) => {
      // Transform a single top-level field. Read → transform → validate
      // merged state → write only that key. Parallel to @pyreon/store's
      // `update<K extends keyof T & string>(...)`.
      const current = readCurrent()
      const next = transformer(current[key])
      const merged = { ...current, [key]: next }
      const valid = validateOrFail(merged, 'update')
      if (valid === undefined) return
      // Write only the changed key (other keys already validated equal).
      const sig = instance[key] as Signal<unknown>
      if (!Object.is(sig.peek(), valid[key])) {
        sig.set(valid[key])
      }
    }

    instance.reset = () => {
      // initialSnapshotForReset is the PARSED value captured at .create()
      // time. Re-parse to apply any defaults that depend on call time.
      const result = parseFn(initialSnapshotForReset)
      if (result instanceof Promise) {
        throw new Error(
          '[Pyreon] model.reset(): schema returned a Promise. Async schemas unsupported.',
        )
      }
      if (!result.ok) {
        throw new Error(formatIssues(result.issues, 'reset'))
      }
      writeAll(result.value as Record<string, unknown>)
    }
  }

  // Helper: forbid a view/action from shadowing state OR a schema-installed
  // mutation helper. Plain mode skips the helper check (no helpers installed).
  const checkReserved = (key: string, factoryKind: 'views' | 'actions'): void => {
    if (meta.stateKeys.includes(key)) {
      throw new Error(
        `[Pyreon] model.${factoryKind}(): "${key}" collides with a schema/state field. ` +
          'Pick a different name.',
      )
    }
    if (isSchemaMode && RESERVED_SCHEMA_HELPER_KEYS.includes(key as never)) {
      throw new Error(
        `[Pyreon] model.${factoryKind}(): "${key}" collides with a reserved ` +
          'schema-mode mutation helper (`set` / `patch` / `deepPatch` / `update` / ' +
          '`reset`). These names are reserved for the validated mutation surface. ' +
          'Pick a different name.',
      )
    }
  }

  // ── 4. Views (chained, in registration order) ─────────────────────────────
  // Each factory sees the live `self` proxy — including prior views/actions
  // and (in schema mode) the set/patch/deepPatch/update/reset helpers
  // installed above.
  for (const factory of config.viewFactories) {
    const views = factory(self) as Record<string, unknown>
    for (const [key, view] of Object.entries(views)) {
      checkReserved(key, 'views')
      instance[key] = view
    }
  }

  // ── 5. Actions (chained, wrapped with middleware runner) ──────────────────
  // Same collision rule. Each action is wrapped in `runAction` so middleware
  // sees every call (sync OR async — `runAction` awaits Promise returns).
  for (const factory of config.actionFactories) {
    const rawActions = factory(self) as Record<string, (...args: unknown[]) => unknown>
    for (const [key, actionFn] of Object.entries(rawActions)) {
      checkReserved(key, 'actions')
      instance[key] = (...args: unknown[]) => runAction(meta, key, actionFn, args)
    }
  }

  return instance
}

// Legacy alias — `ModelConfig` was the previous interface name. Re-exported
// as `NormalizedConfig` for any external consumer.
export type { NormalizedConfig as ModelConfig } from './model'

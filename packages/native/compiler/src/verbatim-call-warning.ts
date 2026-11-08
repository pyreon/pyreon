// The last line of defence for a call to a Pyreon package function nothing lowered.
//
// Every lowering seam (`services`, `calls`, `functions`, `receivers`, the emitters' own arms) turns a call it claims into
// something else. A call NOBODY claims is re-emitted verbatim: `getSnapshot(model)` becomes a Swift / Kotlin call to a
// function that does not exist, and the native build fails with "cannot find 'getSnapshot' in scope" and no warning from
// this compiler. Found by compiling every package's documented `api[].example` (inside a component, with its imports)
// through the real compiler: 38 of 121 plain examples ended exactly there. The import-keyed warnings cover hooks
// (`use*`), the web-only packages and the modules with per-export advice; this covers a partial package's other exports.
//
// It reads the FINAL emitted text, not the emitter's call tail, on purpose. The tail is also reached while computing
// output that is later discarded (a plugin that dropped a declaration still has its expression visited), and a warning
// from there blamed calls that never reached the file. "Reproduced verbatim" is a statement about the output.

/**
 * Escape every character that is special in a regular expression. A name read from user source is normally a plain
 * identifier, but it is spliced into a `RegExp`, so it is escaped completely (backslash included) rather than for the
 * one character (`$`) an identifier can contain.
 */
function escapeRegExp(text: string): string {
  return text.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')
}

/**
 * Third-party schema libraries PMTC reads ONLY through a Pyreon adapter (`zodSchema(z.object({…}))`, or the first-party `s`). A bare `z.object({…})` outside an adapter is
 * not read at all and is re-emitted verbatim — uncompilable Swift / Kotlin with no other diagnostic — so these imports
 * are judged by survival exactly like a Pyreon export.
 */
export const THIRD_PARTY_SCHEMA_LIBRARIES: ReadonlySet<string> = new Set(['zod', 'valibot', 'arktype'])

/** A function imported from a Pyreon package, by local name (see `collectAliasImports`). */
export type PyreonFunctionImports = ReadonlyMap<string, { readonly source: string; readonly imported: string }>

/** Strip string literals and comments so a name inside embedded HTML / JS text does not count as a call. */
function stripLiteralsAndComments(code: string): string {
  let out = ''
  let i = 0
  while (i < code.length) {
    const c = code[i]!
    const n = code[i + 1]
    if (c === '/' && n === '/') {
      while (i < code.length && code[i] !== '\n') i++
    } else if (c === '/' && n === '*') {
      i += 2
      while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) i++
      i += 2
    } else if (c === '"' && code.startsWith('"""', i)) {
      i += 3
      while (i < code.length && !code.startsWith('"""', i)) i++
      i += 3
    } else if (c === '"') {
      i++
      while (i < code.length && code[i] !== '"') i += code[i] === '\\' ? 2 : 1
      i++
    } else {
      out += c
      i++
    }
  }
  return out
}

/**
 * Warnings for functions imported from a `@pyreon/*` package whose call survives in the emitted `code`, skipping any
 * name an earlier warning already mentions (a plugin's own diagnostic is more specific than this one).
 */
export function verbatimPyreonCallWarnings(
  imports: PyreonFunctionImports,
  source: string,
  code: string,
  existingWarnings: readonly string[],
): string[] {
  if (imports.size === 0) return []
  const body = stripLiteralsAndComments(code)
  const out: string[] = []
  const reported = new Set<string>()
  // The source with its import lines removed: a name that only appears in an `import` is not a use.
  const sourceBody = source.replace(/^\s*import\b[^\n]*$/gm, '')
  for (const [local, imp] of imports) {
    // Functions only: `collectAliasImports` also tracks JSX tags (`Row`), which the emitters lower into a native
    // composable of the same spelling — a `Row(` in the output is theirs, not a leftover call.
    const schemaLibrary = THIRD_PARTY_SCHEMA_LIBRARIES.has(imp.source)
    if (!/^[a-z]/.test(imp.imported) || !(imp.source.startsWith('@pyreon/') || schemaLibrary) || reported.has(imp.imported)) continue
    if (new RegExp(`(?<![\\w$])${escapeRegExp(imp.imported)}(?![\\w$])`).test(existingWarnings.join('\n'))) continue
    const name = escapeRegExp(local)
    // A call of the LOCAL name as written, not a member call (`x.getSnapshot(` is some other object's method) and not
    // a declaration of a function that happens to share the name.
    const callInEmit = new RegExp(`(?<![\\w.$])${name}\\s*(?:<[^()]*>)?\\s*\\(`)
    // The SOURCE must use it too. A preset or helper passed as a VALUE (`.preset(scaleIn)`) is consumed by its
    // package's lowering, and the emitted text can still contain the same spelling as a native API (Compose's own
    // `scaleIn(`), which is not the import surviving. The source call may carry type arguments: `createRef<T>()`.
    const callInSource = new RegExp(`(?<![\\w.$])${name}\\s*(?:<[^()]*>)?\\s*\\(`)
    // A bare REFERENCE (`isClient ? a : b`) is the other way an unlowered export survives: not a call, but the same
    // identifier, with the same "cannot find in scope" waiting on the device. It must not be a label (`name:`), a
    // member (`x.name`), or a call (handled above).
    // `name:` is a Swift argument label and `name =` a Kotlin named argument (`AsyncImage(model = …)`): a native API's
    // parameter that shares a spelling with a Pyreon export, not a leftover import. `==` is a comparison, not a label.
    const bare = new RegExp(`(?<![\\w.$])${name}(?![\\w$])(?!\\s*(?:[:(<]|=(?!=)))`)
    const surviveAsCall = callInEmit.test(body) && callInSource.test(sourceBody)
    // In the output the survivor is a bare identifier even when the source CALLED it (`createRef<T>()` is emitted as
    // `createRef`), so the source side accepts any use of the name: a call, a generic call, or a value.
    const usedInSource = new RegExp(`(?<![\\w.$])${name}(?![\\w$])`).test(sourceBody)
    const surviveAsValue = bare.test(body) && usedInSource
    if (!surviveAsCall && !surviveAsValue) continue
    // A native declaration of the same name (a function the emitter wrote, a binding the user wrote) is not a leftover.
    if (new RegExp(`\\b(?:func|fun|let|var|val|const)\\s+${name}\\b`).test(body)) continue
    reported.add(imp.imported)
    // Described the way the AUTHOR used it: a name they called is a function, whatever shape the emit left behind.
    const calledByAuthor = surviveAsCall || callInSource.test(sourceBody)
    const shown = calledByAuthor ? `${imp.imported}()` : imp.imported
    if (schemaLibrary) {
      out.push(
        `${shown} (from ${imp.source}) is reproduced verbatim in the emitted Swift/Kotlin, where no such ${calledByAuthor ? 'function' : 'value'} exists, ` +
          `so the native build fails with "cannot find '${imp.imported}' in scope". PMTC reads ${imp.source} only through an adapter: wrap a ` +
          `top-level schema in the Pyreon validation adapter for that library (\`zodSchema(…)\` / \`valibotSchema(…)\` / \`arktypeSchema(…)\`), or write the schema ` +
          `with the first-party \`s\` builder (its \`safeParse\` / \`parse\` lower), or keep it behind a \`<Web>\` escape hatch.`,
      )
      continue
    }
    out.push(
      `${shown} (from ${imp.source}) has NO native lowering — it is reproduced verbatim in the emitted ` +
        `Swift/Kotlin, where no such ${calledByAuthor ? 'function' : 'value'} exists, so the native build fails with "cannot find '${imp.imported}' in scope". ` +
        `Keep it behind a \`<Web>\` escape hatch (web target only), or replace it with an API that lowers (the package's ` +
        `\`multiplatform\` rationale and the lowering table in the docs say which).`,
    )
  }
  return out
}

/**
 * Warnings for a TYPE imported from a Pyreon package that survives into the emitted code undeclared.
 *
 * `(s: TransitionStage) => …` is copied through with its annotation, and no Swift or Kotlin type of that name exists, so
 * the build fails with "cannot find type 'TransitionStage' in scope" and the compiler said nothing. Judged by survival,
 * like the function check: a type the emitters lowered, a type a plugin's runtime declares (`runtimeTypes`), or one the
 * emitted file declares itself never gets here.
 */
export function verbatimPyreonTypeWarnings(
  typeImports: PyreonFunctionImports | undefined,
  code: string,
  runtimeTypes: ReadonlyMap<string, string>,
  existingWarnings: readonly string[],
): string[] {
  if (typeImports === undefined || typeImports.size === 0) return []
  const body = stripLiteralsAndComments(code)
  const out: string[] = []
  const reported = new Set<string>()
  for (const [local, imp] of typeImports) {
    if (reported.has(imp.imported) || runtimeTypes.has(local) || runtimeTypes.has(imp.imported)) continue
    if (new RegExp(`(?<![\\w$])${escapeRegExp(imp.imported)}(?![\\w$])`).test(existingWarnings.join('\n'))) continue
    const name = escapeRegExp(local)
    if (!new RegExp(`(?<![\\w.$])${name}(?![\\w$])`).test(body)) continue
    // The emitted file declares it itself (a struct synthesized from the shape, an enum from a string union).
    if (new RegExp(`\\b(?:struct|class|enum|protocol|typealias|interface|object)\\s+${name}\\b`).test(body)) continue
    reported.add(imp.imported)
    out.push(
      `type ${imp.imported} (from ${imp.source}) has no native counterpart — the annotation is reproduced verbatim in the ` +
        `emitted Swift/Kotlin, where no such type exists, so the native build fails with "cannot find type '${imp.imported}' in ` +
        `scope". Declare a type of your own in this file instead (an object shape, a string-literal union, or a primitive), or ` +
        `keep the code behind a \`<Web>\` escape hatch.`,
    )
  }
  return out
}

/**
 * JavaScript / browser globals with no native counterpart of the same spelling, and what to write instead.
 *
 * Every lowering arm in the emitters claims a few of these (`Math.*`, `Date.now`, `parseInt`, `console.log`, …). One
 * nobody claims is re-emitted verbatim, and the native build fails with "cannot find 'setTimeout' in scope" — with no
 * warning from this compiler. A probe of everyday app code found eight of these silent failures (timers, `fetch`,
 * `Promise.all`, `crypto`, `Number.isNaN`, `localeCompare`, `console.error`). Judged by SURVIVAL in the final output,
 * like the Pyreon-import check above, so a global some arm lowers never reaches this list's warning.
 *
 * Names a native API also spells (`Array(`, `String(`, `URL(`, `Date(`, `Error`, `Math.` — java.lang.Math on Kotlin,
 * Kotlin's `require(`) are deliberately absent: their survival is not evidence of anything.
 */
const PLATFORM_GLOBAL_ADVICE: Readonly<Record<string, string>> = {
  requestAnimationFrame: 'animate with `<Transition>` or a primitive\'s animation props',
  cancelAnimationFrame: 'animate with `<Transition>` or a primitive\'s animation props',
  requestIdleCallback: 'do the work in `onMount` or a handler',
  queueMicrotask: 'do the work in `onMount` or a handler',
  structuredClone: 'copy with a spread (`{ ...x }`, `[...xs]`), which lowers',
  fetch: 'fetch through the framework\'s data-fetching hook, which lowers to the native HTTP client',
  Promise: 'await the calls one after another — `Promise` combinators have no native lowering',
  crypto: 'only `crypto.randomUUID()` lowers',
  window: 'browser state has no native counterpart; keep it behind a `<Web>` escape hatch',
  document: 'the DOM has no native counterpart; keep it behind a `<Web>` escape hatch',
  navigator: 'use the platform hooks (network status, clipboard, share, geolocation, …), which lower',
  localStorage: 'use the storage package\'s storage hook, which lowers to the platform store',
  sessionStorage: 'use the storage package\'s storage hook, which lowers to the platform store',
  location: 'read and change the route through the router, which lowers',
  history: 'navigate through the router, which lowers',
  globalThis: 'reference the value directly',
  alert: 'present a `<Modal>` or a toast, which lower',
  confirm: 'present a `<Modal>`, which lowers',
  prompt: 'present a `<Modal>` with a `<Field>`, which lower',
  performance: '`Date.now()` lowers',
  process: 'there is no process environment on a device',
  Buffer: 'Buffer is a Node API',
  Number: '`Number(x)`, `Number.isNaN`, `Number.isFinite`, `Number.isInteger`, `Number.parseInt` and `Number.parseFloat` lower',
  Object: '`Object.keys` / `Object.values` lower only on a statically-known object shape',
  JSON: '`JSON.stringify(x)` and a typed `JSON.parse(s) as T` lower',
  Intl: '`new Intl.DateTimeFormat(…)` / `new Intl.NumberFormat(…)` bound to a const lower',
  RegExp: 'regular expressions have no native lowering; rewrite with string methods',
  Symbol: 'symbols have no native counterpart',
  Reflect: 'reflection has no native counterpart',
  Proxy: 'proxies have no native counterpart',
  WeakMap: 'use a `Map` keyed by an id, which lowers',
  WeakSet: 'use a `Set` of ids, which lowers',
  WeakRef: 'weak references have no native lowering',
  BigInt: 'big integers have no native lowering',
  URLSearchParams: 'build the query with a template literal, or pass route params through the router',
  FormData: 'send JSON through the data-fetching hook, which lowers',
  Blob: 'binary data has no native lowering',
  AbortController: 'the data-fetching hook cancels its own requests',
  TextEncoder: 'byte encoding has no native lowering',
  TextDecoder: 'byte decoding has no native lowering',
  atob: 'base64 has no native lowering',
  btoa: 'base64 has no native lowering',
  encodeURIComponent: 'URL encoding has no native lowering; pass values as route params or a JSON body',
  decodeURIComponent: 'URL decoding has no native lowering; the router decodes params',
  encodeURI: 'URL encoding has no native lowering',
  decodeURI: 'URL decoding has no native lowering',
  console: '`console.log` / `info` / `debug` / `warn` / `error` lower to the platform print',
}

/** JavaScript methods with no lowering and no same-spelled method in Swift's or Kotlin's standard library. */
const JS_ONLY_METHODS: readonly string[] = [
  'localeCompare',
  'toISOString',
  'toUTCString',
  'toDateString',
  'toTimeString',
  'toLocaleDateString',
  'toLocaleTimeString',
  'getTime',
  'getFullYear',
  'getMonth',
  'getDate',
  'getDay',
  'getHours',
  'getMinutes',
  'getSeconds',
  'getMilliseconds',
  'getTimezoneOffset',
  'setFullYear',
  'setMonth',
  'setDate',
  'setHours',
  'setMinutes',
  'setSeconds',
  'toFixed',
  'toPrecision',
  'toExponential',
  'toSorted',
  'toReversed',
  'toSpliced',
  'findLast',
  'findLastIndex',
  'splice',
  'unshift',
  'substr',
  'charAt',
  'normalize',
  'trimLeft',
  'trimRight',
  'flat',
]

/** JavaScript methods Kotlin's standard library spells the same way (so only a SURVIVING Swift call is broken). */
const JS_METHODS_SWIFT_ONLY: readonly string[] = ['padStart', 'padEnd', 'trimStart', 'trimEnd', 'substring', 'codePointAt']

function targetLabel(target: string): string {
  return target === 'swift' ? 'Swift' : target === 'kotlin' ? 'Kotlin' : target
}

function missingSymbolError(target: string, name: string): string {
  return target === 'kotlin' ? `"unresolved reference '${name}'"` : `"cannot find '${name}' in scope"`
}

/** Whether the SOURCE binds `name` itself — a declaration, an import, a parameter or a destructured binding. */
function declaredInSource(source: string, name: string): boolean {
  const n = escapeRegExp(name)
  return (
    new RegExp(`\\b(?:const|let|var|function|class|enum|type|interface)\\s+${n}\\b`).test(source) ||
    new RegExp(`\\bimport\\b[^;\\n]*\\b${n}\\b`).test(source) ||
    // a parameter (`(location) =>`, `(a, history: H) =>`, `history =>`) or a destructured binding (`{ document }`)
    new RegExp(`[({,]\\s*(?:\\.\\.\\.)?${n}\\s*[?]?\\s*[:,)}=]`).test(source) ||
    new RegExp(`(?<![\\w.$])${n}\\s*=>`).test(source)
  )
}

/**
 * Warnings for a JavaScript or browser global, or a JavaScript-only method, that survives VERBATIM in the emitted code
 * — the shapes that otherwise fail the native build with no diagnostic. A name an earlier warning already mentions is
 * skipped (that warning is more specific).
 */
export function verbatimPlatformWarnings(
  source: string,
  code: string,
  target: string,
  existingWarnings: readonly string[],
): string[] {
  const body = stripLiteralsAndComments(code)
  const sourceBody = stripLiteralsAndComments(source.replace(/^\s*import\b[^\n]*$/gm, ''))
  const known = existingWarnings.join('\n')
  const mentioned = (name: string) => new RegExp(`(?<![\\w$])${escapeRegExp(name)}(?![\\w$])`).test(known)
  const out: string[] = []
  for (const [name, advice] of Object.entries(PLATFORM_GLOBAL_ADVICE)) {
    const n = escapeRegExp(name)
    // A call (`setTimeout(`) or a namespace read (`crypto.`), not a member of something else (`x.fetch(`).
    const use = new RegExp(`(?<![\\w.$])${n}\\s*[.(]`)
    if (!use.test(body) || !use.test(sourceBody)) continue
    if (declaredInSource(source, name) || mentioned(name)) continue
    // The emitted file declares it itself (a helper the emitter wrote, a binding the user wrote).
    if (new RegExp(`\\b(?:func|fun|let|var|val|struct|class|enum|object)\\s+${n}\\b`).test(body)) continue
    out.push(
      `${name} is a JavaScript/browser global with no native lowering — it is reproduced verbatim in the emitted ` +
        `${targetLabel(target)}, where no such symbol exists, so the native build fails with ${missingSymbolError(target, name)}. ` +
        `${advice[0]!.toUpperCase()}${advice.slice(1)}.`,
    )
  }
  const methods = target === 'swift' ? [...JS_ONLY_METHODS, ...JS_METHODS_SWIFT_ONLY] : JS_ONLY_METHODS
  for (const name of methods) {
    const call = new RegExp(`\\.\\s*${escapeRegExp(name)}\\s*\\(`)
    if (!call.test(body) || !call.test(sourceBody) || mentioned(name)) continue
    out.push(
      `.${name}(…) is a JavaScript method with no ${targetLabel(target)} lowering — it is reproduced verbatim, and the native build fails ` +
        `with ${target === 'kotlin' ? `"unresolved reference '${name}'"` : `"value has no member '${name}'"`}. Rewrite it with a method that lowers (the supported-TypeScript table lists them), ` +
        `or keep the code behind a \`<Web>\` escape hatch.`,
    )
  }
  return out
}

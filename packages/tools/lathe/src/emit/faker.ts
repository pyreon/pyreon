/**
 * Fake-data factories.
 *
 * The mock plugin already emits fixtures, and they are DETERMINISTIC by
 * construction — derived from the spec, identical every run, which is what a
 * snapshot test needs. This is the other half: a factory you CALL, so a test
 * can ask for a hundred books, or a book that is `lost`, without writing one
 * out by hand.
 *
 * The one rule that matters here is that a factory must produce data its own
 * schema ACCEPTS. A generator that emits a pretty `faker.lorem.words()` for a
 * field the spec constrains to `maxLength: 8` produces fixtures that fail the
 * validation the generated client performs on every response — a fake that is
 * wrong in exactly the way real data never is, and that only shows up as a
 * confusing parse error inside a test. So CONSTRAINTS OUTRANK REALISM
 * everywhere below: `min`/`max`/`pattern`/`enum` pick the generator first, and
 * the field-name and format heuristics only get to choose when nothing in the
 * spec objects.
 *
 * Depth is threaded explicitly rather than kept in module state. A recursive
 * model (a comment with replies, a tree node with children) otherwise recurses
 * until the stack ends, and a module-level counter makes concurrent factory
 * calls interfere — the same reason this repo's reactivity code restores
 * frame state instead of resetting it.
 */

import { cyclicModels, modelIndex, stronglyConnected } from '../core/graph'
import type { IrDocument, IrField, IrModel, IrType } from '../core/ir'
import { pascal, propKey } from '../core/naming'
import { q, relativeSpecifier, SourceFile } from './writer'

export const FAKER_FILE = 'faker.ts'
export const FAKER_PACKAGE = '@faker-js/faker'

/** How deep a self-referential model is expanded before it bottoms out. */
const MAX_DEPTH = 3

/**
 * Emit `faker.ts` — one factory per model.
 *
 * `typesFrom` is the module the model TYPES come from: `./schemas` when the
 * schema plugin ran, `./types` otherwise. Both export the same names, so the
 * factories are identical either way.
 */
export function emitFaker(doc: IrDocument, typesFrom: 'schemas' | 'types'): SourceFile | null {
  const f = new SourceFile(FAKER_FILE)
  if (doc.models.length === 0) return null

  // Which models can reach THEMSELVES through the fields a factory actually
  // expands. Over the FAKER graph, not the schema one: `additionalProperties`
  // is never rendered here, so a cycle that only closes through it cannot
  // recurse. This used to be derived from the topological sort's back edges,
  // split on `'->'` -- while `edgeKey` joins with `'|'`, so the set held whole
  // keys as names and the recursion notice below never fired for anything.
  // Computed fresh for every emit and held for the render walk below.
  const graph = computeFakerGraph(doc)
  graphs.set(doc, graph)
  const cyclic = graph.cyclic

  f.import(FAKER_PACKAGE, 'faker')
  f.importType(relativeSpecifier(FAKER_FILE, `${typesFrom}.ts`), ...doc.models.map((m) => m.name))

  f.line()
  f.doc(
    `Fake-data factories for ${doc.title} ${doc.version}.`,
    '',
    'Every factory produces a value its own schema ACCEPTS: where the spec',
    'states a length, a range, a pattern or an enum, that constraint chooses',
    'the generator, and the prettier field-name guess only applies when',
    'nothing in the spec objects.',
    '',
    '```ts',
    'seedFaker(42)                       // reproducible across runs',
    'const book = createBook()',
    "const lost = createBook({ status: 'lost' })",
    'const many = Array.from({ length: 20 }, () => createBook())',
    '```',
  )

  f.doc(
    'Seed the shared generator so factories are reproducible.',
    '',
    'faker keeps ONE global generator, so this affects every factory here and',
    'anything else in the process using faker. Call it in a test setup, not',
    'inside a factory -- a factory that reseeds returns the same value forever.',
  )
  f.line('export function seedFaker(seed = 1): void {')
  f.line('  faker.seed(seed)')
  f.line('}')

  for (const model of doc.models) {
    const name = `create${pascal(model.name)}`
    const overridable = takesOverrides(model)
    f.line()
    f.doc(
      model.doc ?? `A fake \`${model.name}\`.`,
      '',
      overridable
        ? '`overrides` is shallow and applied LAST, so any field can be pinned'
        : undefined,
      overridable ? 'without rebuilding the rest.' : undefined,
    )
    // Only an OBJECT model takes overrides. `Partial<X> = {}` for an array,
    // a scalar or a union model does not typecheck (`{}` is not a `Pet[]`),
    // and there is no field to pin in any of them -- the parameter existed and
    // was silently ignored. A caller wanting a specific value of a non-object
    // model already has it: it is the value.
    f.line(
      overridable
        ? `export function ${name}(overrides: Partial<${model.name}> = {}): ${model.name} {`
        : `export function ${name}(): ${model.name} {`,
    )
    f.line(`  return build${pascal(model.name)}(0${overridable ? ', overrides' : ''})`)
    f.line('}')
  }

  // The depth-threaded builders sit behind the public factories so the public
  // signature never leaks the recursion parameter.
  for (const model of doc.models) {
    f.line()
    const recurses = cyclic.has(model.name)
    f.doc(
      `Depth-threaded builder for \`${model.name}\`.`,
      recurses
        ? `\`${model.name}\` is recursive in the spec, so expansion stops at depth ${MAX_DEPTH}.`
        : undefined,
    )
    f.line(
      takesOverrides(model)
        ? `function build${pascal(model.name)}(d: number, o: Partial<${model.name}> = {}): ${model.name} {`
        : `function build${pascal(model.name)}(d: number): ${model.name} {`,
    )
    f.line(`  return ${render(model.type, doc, 1, undefined, model.name)}`)
    f.line('}')
  }
  return f
}

/**
 * Does this model's factory take `overrides`? Only when it renders as an
 * object literal carrying the `...o` spread -- see the object branch below.
 */
function takesOverrides(model: IrModel): boolean {
  return model.type.kind === 'object'
}

/**
 * Model -> models its FACTORY expands. Mirrors exactly what `render` walks:
 * object fields, array items, union options -- never `additional`, which no
 * factory renders.
 */
function fakerDependencies(doc: IrDocument): Map<string, Set<string>> {
  const known = new Set(doc.models.map((m) => m.name))
  const out = new Map<string, Set<string>>()
  const walk = (t: IrType, into: Set<string>): void => {
    switch (t.kind) {
      case 'ref':
        if (known.has(t.name)) into.add(t.name)
        return
      case 'array':
        walk(t.items, into)
        return
      case 'object':
        for (const f of t.fields) walk(f.type, into)
        return
      case 'union':
        for (const o of t.options) walk(o, into)
        return
      default:
    }
  }
  for (const m of doc.models) {
    const deps = new Set<string>()
    walk(m.type, deps)
    out.set(m.name, deps)
  }
  return out
}

/**
 * An arrow function's body. An object literal must be PARENTHESIZED: `() => {
 * id: 1 }` parses as a block with a label, and a real one with two fields is a
 * syntax error. Every inline-object array item and union branch produced it.
 */
function arrowBody(expr: string): string {
  return expr.startsWith('{') ? `(${expr})` : expr
}

/** Render an expression producing a value of `type`. */
function render(
  type: IrType,
  doc: IrDocument,
  depth: number,
  field: IrField | undefined,
  self: string,
): string {
  switch (type.kind) {
    case 'string':
      return stringExpr(type, field)
    case 'number': {
      const min = field?.min
      const max = field?.max
      if (type.integer) {
        const opts = rangeOpts(min ?? 1, max ?? 1000)
        return `faker.number.int(${opts})`
      }
      return `faker.number.float(${rangeOpts(min ?? 0, max ?? 1000)})`
    }
    case 'boolean':
      return 'faker.datatype.boolean()'
    case 'null':
      return 'null'
    case 'unknown':
      return 'null'
    case 'array': {
      const inner = render(type.items, doc, depth + 1, undefined, self)
      // A recursive array bottoms out as EMPTY, which is the one value a
      // recursive list is always allowed to take.
      const guard = referencesSelf(type.items, doc, self)
      const body = `faker.helpers.multiple(() => ${arrowBody(inner)}, { count: { min: 1, max: 3 } })`
      return guard ? `(d >= ${MAX_DEPTH} ? [] : ${body})` : body
    }
    case 'ref': {
      if (!modelIndex(doc).has(type.name)) return 'null'
      return `build${pascal(type.name)}(d + 1)`
    }
    case 'union': {
      if (type.options.length === 0) return 'null'
      // Every branch is rendered and one is picked at call time, so a union
      // exercises all of its shapes across a run rather than pinning the first.
      const branches = type.options.map((o) => `() => ${arrowBody(render(o, doc, depth + 1, undefined, self))}`)
      return `faker.helpers.arrayElement([${branches.join(', ')}])()`
    }
    case 'object': {
      const parts: string[] = []
      for (const fld of type.fields) {
        const value = renderField(fld, doc, depth, self)
        if (value === null) continue
        parts.push(`${propKey(fld.name)}: ${value}`)
      }
      // Overrides land LAST at the top level only; nested objects have none.
      const spread = depth === 1 ? ', ...o' : ''
      if (parts.length === 0) return `{${spread ? ' ...o ' : ''}}`
      const indent = '  '.repeat(depth + 1)
      const close = '  '.repeat(depth)
      return `{\n${parts.map((p) => `${indent}${p},`).join('\n')}${spread ? `\n${indent}...o,` : ''}\n${close}}`
    }
  }
}

/**
 * A field's value, or `null` to OMIT the field.
 *
 * An optional field whose type recurses is omitted at the depth limit — that
 * is what makes a recursive model terminate without lying about its type.
 */
function renderField(
  field: IrField,
  doc: IrDocument,
  depth: number,
  self: string,
): string | null {
  // `depth + 1`: a field's VALUE sits one level below the object holding
  // it. Passing `depth` unchanged rendered a NESTED object at depth 1
  // too, so it took the `depth === 1` overrides spread — and
  // `createUser({ id: 'x' })` then put `id` inside `address` as well.
  // The generated schema rejects that shape, so the fixture fails the
  // validator generated from the same spec. The object branch already
  // indents its children at `depth + 1`, which is the intent this
  // restores.
  const value = render(field.type, doc, depth + 1, field, self)
  if (field.type.kind !== 'ref') return value
  if (!referencesSelf(field.type, doc, self)) return value
  // A recursive REF. Optional -> omit at the limit. Required -> there is no
  // finite value; recursion is capped and the cast is deliberate, with the
  // reason in the emitted comment rather than a silent `null`.
  if (!field.required) return `(d >= ${MAX_DEPTH} ? undefined : ${value})`
  return `(d >= ${MAX_DEPTH} ? (null as never) : ${value})`
}

/**
 * Whether `type` can reach `self` — i.e. expanding it recurses.
 *
 * A ref recurses iff it IS `self` or can reach `self`, and since `self`
 * references it, "can reach `self`" is exactly "shares `self`'s strongly-
 * connected component". So this is a walk of `type`'s OWN refs plus a lookup,
 * where it used to be a transitive walk of the whole reachable graph per field
 * with a linear `doc.models.find` per step -- quadratic to cubic on a spec with
 * a large cycle. Measured on Stripe (`--plugins faker`) that walk was 64% of
 * generation.
 */
function referencesSelf(type: IrType, doc: IrDocument, self: string): boolean {
  const { component } = fakerGraph(doc)
  const mine = component.get(self)
  const hit = (t: IrType): boolean => {
    switch (t.kind) {
      case 'ref':
        return t.name === self || (mine !== undefined && component.get(t.name) === mine)
      case 'array':
        return hit(t.items)
      case 'object':
        return t.fields.some((f) => hit(f.type))
      case 'union':
        return t.options.some(hit)
      default:
        return false
    }
  }
  return hit(type)
}

interface FakerGraph {
  /** Model -> strongly-connected component id, over the FAKER graph. */
  component: Map<string, number>
  /** Models whose expansion recurses. */
  cyclic: Set<string>
}

/**
 * The faker graph for a document, computed once per emit and held WEAKLY so
 * it dies with the document. A lookup table the render walk consults, not
 * state it mutates.
 */
const graphs = new WeakMap<IrDocument, FakerGraph>()

function fakerGraph(doc: IrDocument): FakerGraph {
  let graph = graphs.get(doc)
  if (!graph) {
    graph = computeFakerGraph(doc)
    graphs.set(doc, graph)
  }
  return graph
}

function computeFakerGraph(doc: IrDocument): FakerGraph {
  const deps = fakerDependencies(doc)
  const component = stronglyConnected(deps)
  return {
    component,
    cyclic: cyclicModels(deps, component),
  }
}

/**
 * Drop regex anchors, which faker emits LITERALLY.
 *
 * Only the outermost pair, and only when unescaped: `\^` is a caret in the
 * generated string and `[^a]` is a negated class, neither of which is an
 * anchor. A `$` preceded by a backslash is likewise a literal dollar.
 */
function stripAnchors(pattern: string): string {
  let out = pattern
  if (out.startsWith('^')) out = out.slice(1)
  if (/(?:^|[^\\])(?:\\{2})*\$$/.test(out)) out = out.slice(0, -1)
  return out
}

function rangeOpts(min: number, max: number): string {
  // A spec can state a min above the default max; the generator must not be
  // handed an empty range.
  const hi = Math.max(min, max)
  return `{ min: ${min}, max: ${hi} }`
}

/**
 * A string generator, constraints first.
 *
 * Order is the whole point: `enum` and `pattern` are exact, `min`/`max` are
 * satisfiable only by a length-controlled generator, and the pretty
 * name/format guesses come last because they cannot honour a length.
 */
function stringExpr(type: Extract<IrType, { kind: 'string' }>, field?: IrField): string {
  if (type.enum && type.enum.length > 0) {
    return `faker.helpers.arrayElement([${type.enum.map(q).join(', ')}] as const)`
  }
  if (field?.pattern) {
    // `fromRegExp` understands a useful subset; an expression it cannot
    // satisfy throws at CALL time, which is a loud, local failure in a test
    // rather than a fixture that quietly fails validation later.
    //
    // The ANCHORS have to go. faker treats `^` and `$` as literal characters,
    // so `'^[A-Z]{3}$'` generates the string `"^ABC$"` -- which then fails the
    // very pattern it was generated from. OpenAPI patterns carry anchors
    // almost universally, so this is the common case, not an edge one.
    return `faker.helpers.fromRegExp(${q(stripAnchors(field.pattern))})`
  }
  const min = field?.min
  const max = field?.max
  // A LOWER bound is the only constraint a realistic generator cannot be made
  // to satisfy: `faker.person.fullName()` has no minimum length anyone can
  // promise. So a real `minLength` falls back to `alpha`, which guarantees an
  // exact bound and is the one case where the fixture is gibberish.
  //
  // The option is `{ length: { min, max } }`, NOT `{ min, max }`. faker accepts
  // the latter without complaint and returns a ONE-character string, so the
  // wrong shape reads as working and fails only against the `minLength` the
  // fixture was supposed to satisfy.
  if (min !== undefined && min > 1) {
    return `faker.string.alpha({ length: ${rangeOpts(min, max ?? Math.max(min, 12))} })`
  }
  // An UPPER bound alone is satisfiable by any generator plus a slice, so the
  // realistic one is kept. This matters more than it looks: `maxLength` with no
  // `minLength` is the common shape in a real document, and treating it as a
  // reason to emit gibberish makes most of a spec's fixtures unreadable --
  // which is the whole thing this plugin exists to avoid.
  const clamp = max !== undefined ? `.slice(0, ${max})` : ''
  switch (type.format) {
    // A FORMAT is itself a constraint, and slicing a uuid or an email produces
    // a value that no longer satisfies it. So the clamp applies only where the
    // format does not already fix the shape -- and a spec that states both a
    // format and a shorter `maxLength` is contradicting itself, which is the
    // spec's bug and not something to paper over with a truncated uuid.
    case 'email':
      return 'faker.internet.email()'
    case 'uri':
      return 'faker.internet.url()'
    case 'uuid':
      return 'faker.string.uuid()'
    case 'date':
      return "faker.date.past().toISOString().slice(0, 10)"
    case 'date-time':
      return 'faker.date.past().toISOString()'
    case 'binary':
      return 'faker.string.alphanumeric(16)'
    default:
      return `${field ? byName(field.name) : 'faker.lorem.word()'}${clamp}`
  }
}

/**
 * The field-NAME guess, applied only when the spec states no constraint.
 *
 * This is what makes generated fixtures readable — `"Marguerite Bode"` beats
 * `"qxvbn"` when a preview renders it. Deliberately small and conservative:
 * a wrong guess here is cosmetic, but a long list of them is a maintenance
 * surface with no test that can fail.
 */
function byName(name: string): string {
  const n = name.toLowerCase()
  if (/(^|_)e?mail$/.test(n)) return 'faker.internet.email()'
  if (/(^|_)(url|uri|href|link|website)$/.test(n)) return 'faker.internet.url()'
  if (/(^|_)(avatar|image|photo|picture|thumbnail)$/.test(n)) return 'faker.image.url()'
  if (/(first_?name)$/.test(n)) return 'faker.person.firstName()'
  if (/(last_?name|surname)$/.test(n)) return 'faker.person.lastName()'
  if (/(^|_)(name|title|label)$/.test(n)) return 'faker.lorem.words({ min: 1, max: 3 })'
  if (/(^|_)(description|summary|body|content|text|bio)$/.test(n)) return 'faker.lorem.sentence()'
  if (/(^|_)(phone|tel|mobile)$/.test(n)) return 'faker.phone.number()'
  if (/(^|_)(city|town)$/.test(n)) return 'faker.location.city()'
  if (/(^|_)country$/.test(n)) return 'faker.location.country()'
  if (/(^|_)(street|address)$/.test(n)) return 'faker.location.streetAddress()'
  if (/(^|_)(slug|code|sku|key)$/.test(n)) return 'faker.string.alphanumeric(8)'
  if (/(^|_)(color|colour)$/.test(n)) return 'faker.color.human()'
  if (/(^|_)(company|organisation|organization|org)$/.test(n)) return 'faker.company.name()'
  return 'faker.lorem.word()'
}

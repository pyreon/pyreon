/**
 * The permanent real-spec gate.
 *
 * Every other suite here tests shapes somebody thought to write down. This one
 * runs the generator over EXCERPTS of real, published specs (GitHub 3.0 and
 * 3.1, OpenAI, DigitalOcean, Stripe, Twilio, Box) plus the small public
 * examples (Petstore, webhooks), and asserts three things no synthetic fixture
 * can stand in for:
 *
 *  1. the document LOADS -- as vendored, and re-serialized as 80-column YAML,
 *     which is the output of every YAML dumper and what the old reader choked
 *     on;
 *  2. the generated `schemas.ts` IMPORTS under both validators -- two real
 *     specs produced a module that threw at import, and a third class (TDZ
 *     ordering) hid until a new IR kind appeared;
 *  3. the spec's OWN `components.examples` validate through the same-named
 *     generated schema, with a checked-in allowlist naming each upstream
 *     example bug -- and an allowlisted example that starts PASSING fails the
 *     gate too, because either the entry is stale or the schema went loose.
 *
 * That single gate would have caught the YAML reader, all three nullability
 * bugs, both discriminator crashes and the enum-with-constraint TypeError. The
 * excerpts are cut by `scripts/corpus-excerpt.ts` (the selected schemas,
 * operations and examples plus their `$ref` closure); the full specs are
 * exercised on demand by `bun scripts/corpus.ts <dir>`.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { stringify } from 'yaml'
import { resolveConfig } from '../core/config'
import { generate } from '../core/generate'
import { typeIdent } from '../core/naming'
import { loadOpenApi } from '../input/openapi'
import { parseSpecText } from '../input/yaml'
import { cleanupGenerated, issuesOf, loadGeneratedSchemas } from './helpers/generated-schemas'

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'corpus')
const FILES = readdirSync(DIR)
  .filter((f) => /\.(json|ya?ml)$/.test(f))
  .sort()

/**
 * Example rejections that are the UPSTREAM spec's bug, not lathe's -- each one
 * checked by hand against the spec text. A new entry needs the same: name the
 * field and why the example is wrong. An empty list is the goal state; an
 * entry here that stops failing fails the gate (see the last spec), so the
 * list cannot quietly outlive its reason.
 */
const UPSTREAM_EXAMPLE_BUGS: Record<string, string> = {
  'github-3.0.excerpt.json#team-full':
    '`type` is required by `team-full` and absent from the example; `organization.archived_at` likewise.',
  'github-3.1.excerpt.json#team-full':
    '`type` is required by `team-full` and absent from the example; `organization.archived_at` likewise.',
  'github-3.1.excerpt.json#pull-request-simple':
    '`labels[0].archived_by` and `requested_teams[0].type` are required and absent from the example.',
}

afterAll(() => cleanupGenerated())

describe.each(FILES)('corpus: %s', (file) => {
  const text = readFileSync(join(DIR, file), 'utf8')

  it('loads, and loads identically after an 80-column YAML round-trip', () => {
    const direct = loadOpenApi(text).doc
    expect(direct.models.length + direct.operations.length).toBeGreaterThan(0)
    // `yaml.stringify` folds long scalars at 80 columns and writes nested
    // sequences as `- - x` -- the shapes every real YAML spec is made of.
    const asYaml = stringify(parseSpecText(text))
    expect(JSON.stringify(loadOpenApi(asYaml).doc)).toBe(JSON.stringify(direct))
  })

  it('generates the full plugin set with unique file paths', () => {
    const { files } = generate(text, resolveConfig({ input: 'x' }))
    const paths = files.map((f) => f.path.toLowerCase())
    expect(new Set(paths).size).toBe(paths.length)
  })

  for (const validator of ['pyreon', 'zod'] as const) {
    it(`${validator}: schemas.ts imports, and the spec's own examples validate`, async () => {
      const tag = `corpus-${file.replace(/[^a-z0-9]/gi, '_')}`
      const { schemas } = await loadGeneratedSchemas(text, validator, tag)
      const examples = ((parseSpecText(text) as { components?: { examples?: Record<string, { value?: unknown }> } })
        .components?.examples ?? {}) as Record<string, { value?: unknown }>
      const rejected: string[] = []
      const staleAllowlist: string[] = []
      let checked = 0
      for (const [name, ex] of Object.entries(examples)) {
        const schema = schemas[typeIdent(name)]
        if (!schema || !('value' in ex)) continue
        checked++
        const issues = issuesOf(schema, ex.value)
        const known = `${file}#${name}` in UPSTREAM_EXAMPLE_BUGS
        if (issues.length > 0 && !known) rejected.push(`${name}: ${issues.map((i) => i.message).join('; ')}`)
        // An allowlisted example that now PASSES means the entry is stale --
        // or the schema has become too loose to notice the upstream bug.
        if (issues.length === 0 && known) staleAllowlist.push(name)
      }
      expect(rejected).toEqual([])
      expect(staleAllowlist).toEqual([])
      if (Object.keys(examples).length > 0) expect(checked).toBeGreaterThan(0)
    }, 120_000)
  }
})

describe('corpus: what each real spec proves', () => {
  const load = (f: string) => loadOpenApi(readFileSync(join(DIR, f), 'utf8')).doc

  it('Stripe sends a FORM body with deepObject encoding', () => {
    const op = load('stripe.excerpt.json').operations.find((o) => o.method === 'POST')
    expect(op?.body?.encoding).toBe('form')
    expect(op?.body?.fieldEncoding?.expand).toMatchObject({ style: 'deepObject' })
  })

  it('Twilio sends a FORM body', () => {
    expect(load('twilio.excerpt.json').operations.find((o) => o.method === 'POST')?.body?.encoding).toBe('form')
  })

  it("DigitalOcean's required X-Dangerous header is a typed, required parameter", () => {
    const op = load('digitalocean.excerpt.json').operations[0]
    expect(op?.headerParams.find((p) => p.name === 'X-Dangerous')?.required).toBe(true)
  })

  it("OpenAI's discriminated unions are kept exactly when they can be built", () => {
    // `Annotation`'s members carry a required enum tag, so it stays
    // discriminated. `Item` has members whose `type` tag is OPTIONAL --
    // `discriminatedUnion` threw at import on exactly that, killing the whole
    // module -- so it degrades to a plain union, with a note naming why.
    const doc = load('openai.excerpt.json')
    expect(doc.models.find((m) => m.name === 'Annotation')?.type).toMatchObject({ kind: 'union', discriminator: 'type' })
    expect(doc.models.find((m) => m.name === 'Item')?.type).toMatchObject({ kind: 'union', discriminator: undefined })
    expect(doc.notes.some((n) => n.at === '#/components/schemas/Item' && /`type` is optional/.test(n.message))).toBe(true)
  })

  it("GitHub's nullable component models are nullable (3.0 and 3.1)", () => {
    for (const f of ['github-3.0.excerpt.json', 'github-3.1.excerpt.json']) {
      const doc = load(f)
      const gist = doc.models.find((m) => m.name === 'BaseGist')?.type
      const user = gist?.kind === 'object' ? gist.fields.find((x) => x.name === 'user')?.type : undefined
      expect(user?.kind, f).toBe(user?.kind === 'nullable' ? 'nullable' : 'ref')
      // Either the field is nullable, or it refs a model that is.
      const target = user?.kind === 'ref' ? doc.models.find((m) => m.name === user.name)?.type.kind : 'nullable'
      expect(target, f).toBe('nullable')
    }
  })

  it('every allowlist entry names a vendored file', () => {
    for (const key of Object.keys(UPSTREAM_EXAMPLE_BUGS)) expect(FILES, key).toContain(key.split('#')[0])
  })
})

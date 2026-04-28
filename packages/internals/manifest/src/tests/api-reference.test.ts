import {
  defineManifest,
  type PackageManifest,
  renderApiReferenceBlock,
  renderApiReferenceEntries,
} from '..'

// Coverage for the MCP api-reference renderers
// (`renderApiReferenceEntries` + `renderApiReferenceBlock`). The
// entries form is a straight mapping of the manifest's `api[]`
// into the MCP record shape; the block form serializes those
// entries back to TS source code that slots between the region
// markers in `packages/tools/mcp/src/api-reference.ts`.

function mk(overrides: Partial<PackageManifest> = {}): PackageManifest {
  return defineManifest({
    name: '@pyreon/flow',
    tagline: 't',
    description: 'd',
    category: 'browser',
    features: [],
    api: [
      {
        name: 'createFlow',
        kind: 'function',
        signature: 'createFlow(config: FlowConfig): FlowInstance',
        summary: 'Create a reactive flow.',
        example: 'const f = createFlow({})',
        mistakes: ['Missing peer dep', 'Reading `.data` as plain'],
      },
    ],
    ...overrides,
  })
}

describe('renderApiReferenceEntries', () => {
  it('strips @pyreon/ from the package key + maps each ApiEntry', () => {
    const m = mk()
    const record = renderApiReferenceEntries(m)
    expect(Object.keys(record)).toEqual(['flow/createFlow'])
    expect(record['flow/createFlow']).toEqual({
      signature: 'createFlow(config: FlowConfig): FlowInstance',
      example: 'const f = createFlow({})',
      notes: 'Create a reactive flow.',
      mistakes: '- Missing peer dep\n- Reading `.data` as plain',
    })
  })

  it('falls back to the bare name if scope is missing', () => {
    // Manifest type allows any string for name — the renderer must
    // not throw for non-scoped forms (e.g. local test manifests).
    const m = mk({ name: 'flow' })
    const record = renderApiReferenceEntries(m)
    expect(Object.keys(record)).toEqual(['flow/createFlow'])
  })

  it('omits `notes` when summary is empty / whitespace only', () => {
    const m = mk({
      api: [
        {
          name: 'createFlow',
          kind: 'function',
          signature: 's',
          summary: '   ',
          example: 'e',
        },
      ],
    })
    const record = renderApiReferenceEntries(m)
    expect(record['flow/createFlow']).toEqual({ signature: 's', example: 'e' })
    expect(record['flow/createFlow']).not.toHaveProperty('notes')
  })

  it('omits `mistakes` when the array is missing or empty', () => {
    const m = mk({
      api: [
        {
          name: 'createFlow',
          kind: 'function',
          signature: 's',
          summary: 'u',
          example: 'e',
          mistakes: [],
        },
      ],
    })
    const record = renderApiReferenceEntries(m)
    expect(record['flow/createFlow']).not.toHaveProperty('mistakes')
  })

  it('stability: deprecated prefixes [DEPRECATED] onto notes', () => {
    const m = mk({
      api: [
        {
          name: 'oldFn',
          kind: 'function',
          signature: 's',
          summary: 'Legacy helper.',
          example: 'oldFn()',
          stability: 'deprecated',
          // `deprecated.removeIn` is required by `defineManifest` policy —
          // the renderer doesn't care about its presence beyond formatting,
          // but the validator throws without it.
          deprecated: { since: '1.0.0', removeIn: '2.0.0' },
        },
      ],
    })
    const record = renderApiReferenceEntries(m)
    expect(record['flow/oldFn']!.notes).toContain('[DEPRECATED] Legacy helper.')
  })

  it('stability: experimental prefixes [EXPERIMENTAL] onto notes', () => {
    const m = mk({
      api: [
        {
          name: 'newFn',
          kind: 'function',
          signature: 's',
          summary: 'Try me.',
          example: 'newFn()',
          stability: 'experimental',
        },
      ],
    })
    const record = renderApiReferenceEntries(m)
    expect(record['flow/newFn']!.notes).toBe('[EXPERIMENTAL] Try me.')
  })

  it('deprecated metadata appends since / replacement / removeIn to notes', () => {
    const m = mk({
      api: [
        {
          name: 'oldFn',
          kind: 'function',
          signature: 's',
          summary: 'Old.',
          example: 'oldFn()',
          stability: 'deprecated',
          deprecated: {
            since: '1.2.0',
            replacement: 'newFn()',
            removeIn: '2.0.0',
          },
        },
      ],
    })
    const record = renderApiReferenceEntries(m)
    expect(record['flow/oldFn']!.notes).toBe(
      '[DEPRECATED] Old. Deprecated since v1.2.0, replaced by newFn(), removal planned in v2.0.0.',
    )
  })

  it('seeAlso appends a `See also: a, b, c` trailer', () => {
    const m = mk({
      api: [
        {
          name: 'fnA',
          kind: 'function',
          signature: 's',
          summary: 'Does A.',
          example: 'fnA()',
          seeAlso: ['fnB', 'fnC'],
        },
      ],
    })
    const record = renderApiReferenceEntries(m)
    expect(record['flow/fnA']!.notes).toBe('Does A. See also: fnB, fnC.')
  })

  it('since on a stable entry appends `Added in vX.Y.Z`', () => {
    const m = mk({
      api: [
        {
          name: 'fn',
          kind: 'function',
          signature: 's',
          summary: 'Does it.',
          example: 'fn()',
          since: '0.12.0',
        },
      ],
    })
    const record = renderApiReferenceEntries(m)
    expect(record['flow/fn']!.notes).toBe('Does it. Added in v0.12.0.')
  })

  it('since on a deprecated entry is suppressed (deprecated.since carries the version)', () => {
    // Rationale: a deprecated entry already prints its `deprecated.since`
    // version; adding an `Added in vX.Y.Z` trailer would be noise.
    const m = mk({
      api: [
        {
          name: 'fn',
          kind: 'function',
          signature: 's',
          summary: 'Does it.',
          example: 'fn()',
          stability: 'deprecated',
          since: '0.5.0',
          deprecated: { since: '1.0.0', removeIn: '2.0.0', replacement: 'newFn()' },
        },
      ],
    })
    const record = renderApiReferenceEntries(m)
    const notes = record['flow/fn']!.notes!
    expect(notes).toContain('Deprecated since v1.0.0')
    expect(notes).not.toContain('Added in v0.5.0')
  })

  it('composes multiple aux fields in stable order: stability → summary → deprecated meta → seeAlso → since', () => {
    const m = mk({
      api: [
        {
          name: 'kitchenSink',
          kind: 'function',
          signature: 's',
          summary: 'Does everything.',
          example: 'kitchenSink()',
          stability: 'experimental',
          seeAlso: ['otherFn'],
          since: '0.9.0',
        },
      ],
    })
    const record = renderApiReferenceEntries(m)
    expect(record['flow/kitchenSink']!.notes).toBe(
      '[EXPERIMENTAL] Does everything. See also: otherFn. Added in v0.9.0.',
    )
  })

  it('preserves insertion order across api[]', () => {
    const m = mk({
      api: [
        { name: 'a', kind: 'function', signature: 's', summary: 'u', example: 'e' },
        { name: 'b', kind: 'hook', signature: 's', summary: 'u', example: 'e' },
        { name: 'c', kind: 'component', signature: 's', summary: 'u', example: 'e' },
      ],
    })
    const record = renderApiReferenceEntries(m)
    expect(Object.keys(record)).toEqual(['flow/a', 'flow/b', 'flow/c'])
  })
})

describe('renderApiReferenceBlock', () => {
  it('emits indented TS object-literal entries joined by blank lines', () => {
    const m = mk({
      api: [
        { name: 'createFlow', kind: 'function', signature: 'createFlow(): FlowInstance', summary: 'Create.', example: 'const f = createFlow()' },
        { name: 'useFlow', kind: 'hook', signature: 'useFlow(): FlowInstance', summary: 'Hook form.', example: 'const f = useFlow()' },
      ],
    })
    expect(renderApiReferenceBlock(m)).toBe(
      `  'flow/createFlow': {
    signature: 'createFlow(): FlowInstance',
    example: 'const f = createFlow()',
    notes: 'Create.',
  },

  'flow/useFlow': {
    signature: 'useFlow(): FlowInstance',
    example: 'const f = useFlow()',
    notes: 'Hook form.',
  },`,
    )
  })

  it('uses a template literal for multi-line examples', () => {
    const m = mk({
      api: [
        {
          name: 'createFlow',
          kind: 'function',
          signature: 's',
          summary: 'u',
          example: 'line 1\nline 2',
        },
      ],
    })
    const block = renderApiReferenceBlock(m)
    expect(block).toContain('example: `line 1\nline 2`,')
  })

  it("uses a template literal for strings containing a single quote", () => {
    const m = mk({
      api: [
        {
          name: 'a',
          kind: 'function',
          signature: "don't",
          summary: 'u',
          example: 'e',
        },
      ],
    })
    const block = renderApiReferenceBlock(m)
    expect(block).toContain("signature: `don't`,")
  })

  it('escapes backticks and `${` when the template-literal form is taken (forced by multi-line)', () => {
    // Single-line strings that happen to contain backticks or `${`
    // take the single-quote path, which handles them natively. The
    // template-literal path only fires for multi-line content — add
    // a newline to exercise the escape logic.
    const m = mk({
      api: [
        {
          name: 'a',
          kind: 'function',
          signature: 's',
          summary: 'u',
          example: '`code`\nand ${expr}',
        },
      ],
    })
    const block = renderApiReferenceBlock(m)
    expect(block).toContain(
      String.raw`example: ` + '`' + String.raw`\`code\`` + '\n' + String.raw`and \${expr}` + '`,',
    )
  })

  it('keeps single-line backtick / ${...} strings on the single-quote path (native handling)', () => {
    const m = mk({
      api: [
        {
          name: 'a',
          kind: 'function',
          signature: 's',
          summary: 'u',
          example: '`code` and ${expr}',
        },
      ],
    })
    const block = renderApiReferenceBlock(m)
    expect(block).toContain("example: '`code` and ${expr}',")
  })

  it('emits mistakes as a `- item` bulleted string (MCP display format)', () => {
    const m = mk()
    const block = renderApiReferenceBlock(m)
    // Multi-item mistakes produce a multi-line string, forcing the
    // template-literal path. Backticks inside items are escaped.
    expect(block).toContain(
      'mistakes: `- Missing peer dep\n' + String.raw`- Reading \`.data\` as plain` + '`,',
    )
  })

  it('empty api[] yields an empty string', () => {
    const m = mk({ api: [] })
    expect(renderApiReferenceBlock(m)).toBe('')
  })
})

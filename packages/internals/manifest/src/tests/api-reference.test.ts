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

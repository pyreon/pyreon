/**
 * Contract for `scripts/check-workflow-shell-order.ts`.
 *
 * The gate exists because shell has no hoisting and `bash -n` cannot see it:
 * the script is syntactically valid, the failure is ordering. The bug it was
 * written for lived in an EARLY-EXIT branch, so every pull request ran the
 * definition first and passed while every push to `main` exited 127.
 *
 * Two properties matter, and they pull in opposite directions:
 *   - a top-level call before the definition MUST be reported
 *   - a call from inside another function's body MUST NOT be, because it runs
 *     at invocation time when all definitions have executed
 * A gate that only had the first would push people to reorder correct code.
 */
import { describe, expect, it } from 'vitest'
import { findUseBeforeDefine, parseRunBlocks } from '../../../../../scripts/check-workflow-shell-order'

describe('findUseBeforeDefine — the shipped bug', () => {
  it('reports a top-level call above the definition', () => {
    // The exact shape of the ci.yml regression: an early-exit branch calls a
    // helper defined further down, past the exit.
    const script = [
      'TC_ALL=\'["core"]\'',
      'if [ "$EVENT" != "pull_request" ]; then',
      '  batch typecheck "$TC_ALL" 3',
      '  exit 0',
      'fi',
      'batch() {',
      '  echo "$1"',
      '}',
      'batch typecheck "$TC_SEL" 3',
    ].join('\n')

    const v = findUseBeforeDefine(script)
    expect(v).toHaveLength(1)
    expect(v[0]).toEqual({ name: 'batch', usedAtLine: 3, definedAtLine: 6 })
  })

  it('is silent once the definition moves above the early exit (the fix)', () => {
    const script = [
      'batch() {',
      '  echo "$1"',
      '}',
      'if [ "$EVENT" != "pull_request" ]; then',
      '  batch typecheck "$TC_ALL" 3',
      '  exit 0',
      'fi',
      'batch typecheck "$TC_SEL" 3',
    ].join('\n')
    expect(findUseBeforeDefine(script)).toEqual([])
  })
})

describe('findUseBeforeDefine — what must NOT be flagged', () => {
  it('allows a call from inside another function body, whatever the order', () => {
    // `batch` calls `emit` before `emit` is defined TEXTUALLY, but the call
    // executes only when `batch` is invoked — by then `emit` exists. This is
    // the real ci.yml relationship and flagging it would be a false positive.
    const script = [
      'batch() {',
      '  emit "$1" "$2"',
      '}',
      'emit() {',
      '  echo "$1=$2"',
      '}',
      'batch a b',
    ].join('\n')
    expect(findUseBeforeDefine(script)).toEqual([])
  })

  it('ignores a mention inside a comment', () => {
    const script = ['# batch is defined below', 'batch() {', '  :', '}', 'batch x'].join('\n')
    expect(findUseBeforeDefine(script)).toEqual([])
  })

  it('does not treat the definition line as a call', () => {
    expect(findUseBeforeDefine('emit() {\n  :\n}\nemit x')).toEqual([])
  })

  it('returns nothing for a script with no functions at all', () => {
    expect(findUseBeforeDefine('echo hi\nbun run build\nexit 0')).toEqual([])
  })

  it('does not flag a variable that shares a function name', () => {
    // `batch=3` is an assignment, not a command — the command-position regex
    // must not match it.
    const script = ['batch=3', 'batch() {', '  :', '}'].join('\n')
    expect(findUseBeforeDefine(script)).toEqual([])
  })
})

describe('findUseBeforeDefine — call shapes', () => {
  it('catches a call in command-substitution position', () => {
    const script = ['out=$(compute x)', 'compute() {', '  echo 1', '}'].join('\n')
    expect(findUseBeforeDefine(script).map((v) => v.name)).toEqual(['compute'])
  })

  it('catches a call under `if !`', () => {
    const script = ['if ! check x; then exit 1; fi', 'check() {', '  :', '}'].join('\n')
    expect(findUseBeforeDefine(script).map((v) => v.name)).toEqual(['check'])
  })

  it('handles the `function name()` spelling', () => {
    const script = ['go', 'function go() {', '  :', '}'].join('\n')
    expect(findUseBeforeDefine(script).map((v) => v.name)).toEqual(['go'])
  })

  it('an UNCLOSED definition is treated as extending to end-of-script', () => {
    // Conservative on purpose: a mis-parsed body can only SUPPRESS a report,
    // never manufacture one, so a formatting surprise cannot red the gate.
    const script = ['open() {', '  helper', 'helper() {', '  :', '}'].join('\n')
    expect(findUseBeforeDefine(script)).toEqual([])
  })
})

describe('parseRunBlocks', () => {
  const WF = `name: CI
jobs:
  build:
    steps:
      - name: First step
        run: |
          echo one
          echo two
      - uses: actions/checkout@v4
      - name: Second step
        run: |
          helper() {
            :
          }
          helper
`

  it('extracts each run block, de-indented, labelled by its step name', () => {
    const blocks = parseRunBlocks(WF)
    expect(blocks).toHaveLength(2)
    expect(blocks[0]!.label).toBe('First step')
    expect(blocks[0]!.script).toBe('echo one\necho two')
    expect(blocks[1]!.label).toBe('Second step')
    expect(blocks[1]!.script.split('\n')[0]).toBe('helper() {')
  })

  it('stops a block at the next key, not at the end of the file', () => {
    expect(parseRunBlocks(WF)[0]!.script).not.toContain('checkout')
  })

  it('returns nothing for a workflow with no block-scalar run steps', () => {
    expect(parseRunBlocks('name: X\njobs:\n  a:\n    steps:\n      - run: echo inline\n')).toEqual([])
  })
})

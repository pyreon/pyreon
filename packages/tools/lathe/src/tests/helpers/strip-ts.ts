import ts from 'typescript'

/**
 * Emitted TypeScript as a function BODY that `new Function` can run: types
 * erased by the real compiler, imports dropped, `export` keywords removed.
 *
 * Erasing with the compiler rather than with line regexes matters: the emit
 * carries interfaces, multi-line type aliases and `as unknown as` casts, and a
 * regex that misses one produces a syntax error that reads like a generator
 * bug.
 */
export function stripTs(source: string): string {
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText
  return js
    .replace(/^import\s+.*$/gm, '')
    .replace(/^export \* from .*$/gm, '')
    .replace(/^export \{\s*\};?$/gm, '')
    .replace(/^export (const|let|function|class) /gm, '$1 ')
}

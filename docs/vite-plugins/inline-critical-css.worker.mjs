// Worker for vite-plugins/inline-critical-css.ts — runs beasties over
// prerendered pages, pulling the next page path from the parent until it
// answers `null`. Plain `.mjs` (not TS) because the plugin is
// bundled into Vite's `.vite-temp` config chunk, so the worker is located by
// path from the project root and loaded by Node directly.
import { readFile, writeFile } from 'node:fs/promises'
import { parentPort, workerData } from 'node:worker_threads'

const { outDir, base } = workerData
const { default: Beasties } = await import('beasties')

let done = 0
const skipped = []
/** Ask the parent for the next page; `null` means the queue is drained. */
const nextFile = () =>
  new Promise((resolve) => {
    parentPort.once('message', resolve)
    parentPort.postMessage({ type: 'next' })
  })

for (let file = await nextFile(); file !== null; file = await nextFile()) {
  try {
    const html = await readFile(file, 'utf8')
    // A fresh instance per page so critical sets never leak across pages;
    // `path` lets beasties resolve the `<link href>` CSS file.
    const beasties = new Beasties({
      path: outDir,
      publicPath: base,
      preload: 'swap', // async-load the full sheet, non-blocking
      pruneSource: false, // keep the full sheet intact for the async load
      fonts: false, // fontPlugin owns @font-face / woff2
      reduceInlineStyles: false, // never touch existing inline <style>
      logLevel: 'silent',
    })
    const processed = await beasties.process(html)
    if (processed && processed !== html) {
      await writeFile(file, processed)
      done++
    }
  } catch (err) {
    skipped.push({ file, message: err instanceof Error ? err.message : String(err) })
  }
}
parentPort.postMessage({ type: 'result', done, skipped })
